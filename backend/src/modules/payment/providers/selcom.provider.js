/**
 * Selcom provider adapter - mobile money (USSD push) AND card checkout.
 *
 * Selcom signs every request with HMAC-SHA256 over a fixed set of fields,
 * plus a vendor (till) ID:
 *
 *   SELCOM_API_BASE_URL   gateway host, e.g. https://apigw.selcommobile.com
 *                         (a trailing /v1 is tolerated)
 *   SELCOM_API_KEY        Selcom "API Key"
 *   SELCOM_API_SECRET     Selcom "API Secret" (used to sign, never sent)
 *   SELCOM_VENDOR_ID      Selcom "vendor" (till / float account identifier)
 *   SELCOM_WEBHOOK_SECRET shared secret for payment notifications
 *                         (see webhookAuth.middleware.js)
 *   SELCOM_PUBLIC_API_URL optional: this API's public origin. When set, each
 *                         order tells Selcom to notify
 *                         <origin>/api/v1/payments/webhooks/selcom, so the
 *                         dashboard-level callback is not the only route.
 *   SELCOM_CARD_PAYMENT_METHODS  payment_methods sent for card checkouts,
 *                         default "ALL" (the hosted page lists cards and any
 *                         other method enabled on the vendor account)
 *
 * The older MOBILE_MONEY_API_BASE_URL / _KEY / _SECRET / _VENDOR_ID names are
 * still read as a fallback, so an existing deployment keeps working.
 *
 * Flows (Checkout API):
 *   mobile money : create-order-minimal -> wallet-payment (USSD push)
 *   card         : create-order (billing details) -> hosted page URL
 *                  (data[0].payment_gateway_url, base64) the buyer is
 *                  redirected to
 *   status       : GET order-status
 *
 * Signing mechanics follow developers.selcommobile.com's Authentication
 * section. Endpoint paths and field names follow Selcom's published Checkout
 * API and client libraries; Selcom hands out final details at onboarding, so
 * confirm them in the sandbox before going live. Refund/disburse still use
 * the payout path of the previous implementation - confirm that with Selcom
 * too (see the notes on those functions).
 *
 * Docs: https://developers.selcommobile.com/
 */

const crypto = require("crypto");
const { classifyStatus } = require("../providerStatus");

const cfg = () => ({
    baseUrl: process.env.SELCOM_API_BASE_URL || process.env.MOBILE_MONEY_API_BASE_URL,
    apiKey: process.env.SELCOM_API_KEY || process.env.MOBILE_MONEY_API_KEY,
    apiSecret: process.env.SELCOM_API_SECRET || process.env.MOBILE_MONEY_API_SECRET,
    vendor: process.env.SELCOM_VENDOR_ID || process.env.MOBILE_MONEY_VENDOR_ID
});

exports.isConfigured = () => {
    const { baseUrl, apiKey, apiSecret, vendor } = cfg();
    return Boolean(baseUrl && apiKey && apiSecret && vendor);
};

const root = () => cfg().baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

const b64 = (value) => Buffer.from(String(value)).toString("base64");

// Selcom's Authentication section specifies ISO 8601 with offset, e.g.
// 2019-02-26T09:30:46+03:00.
const timestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const offsetMinutes = -d.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`;
};

// Signing string is "timestamp=<ts>&field1=value1&field2=value2&..." with the
// timestamp ALWAYS FIRST, fields in the same order as Signed-Fields.
const sign = (fields, ts) => {
    const orderedKeys = Object.keys(fields);
    const digestString = [`timestamp=${ts}`]
        .concat(orderedKeys.map((key) => `${key}=${fields[key]}`))
        .join("&");

    const digest = crypto
        .createHmac("sha256", cfg().apiSecret)
        .update(digestString)
        .digest("base64");

    return { digest, signedFields: orderedKeys.join(",") };
};

const signedRequest = async (method, path, fields) => {
    const { apiKey } = cfg();
    const ts = timestamp();
    const { digest, signedFields } = sign(fields, ts);

    const query = method === "GET" ? `?${new URLSearchParams(fields).toString()}` : "";

    const response = await fetch(`${root()}${path}${query}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `SELCOM ${b64(apiKey)}`,
            "Digest-Method": "HS256",
            Digest: digest,
            Timestamp: ts,
            "Signed-Fields": signedFields
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(fields) })
    });

    const data = await response.json().catch(() => null);

    return { ok: response.ok, data };
};

const succeeded = (data) => data?.resultcode === "000" || data?.result === "SUCCESS";

const buyerFields = (meta = {}) => ({
    buyer_email: meta.buyerEmail || "customer@nexora.co.tz",
    buyer_name: meta.buyerName || "NEXORA Customer"
});

// USSD push to the buyer's phone: create the order, then ask Selcom to push
// the payment prompt to the wallet number.
exports.initiate = async (phone, amount, meta = {}) => {
    const { vendor } = cfg();
    const reference = meta.reference || `NEXORA-${Date.now()}`;
    const msisdn = String(phone || "").replace(/\D/g, "").replace(/^0/, "255");

    const order = await signedRequest("POST", "/v1/checkout/create-order-minimal", {
        vendor,
        order_id: reference,
        ...buyerFields(meta),
        buyer_phone: msisdn,
        amount: Math.round(Number(amount)),
        currency: "TZS",
        no_of_items: 1,
        buyer_remarks: meta.description || "NEXORA payment",
        merchant_remarks: reference,
        ...(process.env.SELCOM_PUBLIC_API_URL
            ? { webhook: b64(`${process.env.SELCOM_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1/payments/webhooks/selcom`) }
            : {})
    });

    if (!order.ok || !succeeded(order.data)) {
        return { success: false, transactionReference: null };
    }

    const push = await signedRequest("POST", "/v1/checkout/wallet-payment", {
        transid: reference,
        order_id: reference,
        msisdn
    });

    return {
        success: push.ok && succeeded(push.data),
        transactionReference: push.data?.reference || order.data?.reference || reference
    };
};

// Hosted card checkout: returns a URL on Selcom's payment page to redirect the
// buyer to. Selcom requires billing details for card payments; whatever the
// caller knows about the buyer is passed through `buyer`, with neutral
// placeholders for the rest.
exports.createCheckoutSession = async ({ amountTzs, reference, description, successUrl, cancelUrl, buyer = {} }) => {
    if (!exports.isConfigured()) {
        throw new Error("Selcom is not configured");
    }

    const { vendor } = cfg();
    const name = buyer.name || "NEXORA Customer";
    const [firstName, ...rest] = name.split(" ");
    const phone = String(buyer.phone || "").replace(/\D/g, "").replace(/^0/, "255") || "255000000000";

    const fields = {
        vendor,
        order_id: reference,
        buyer_email: buyer.email || "customer@nexora.co.tz",
        buyer_name: name,
        buyer_phone: phone,
        amount: Math.round(Number(amountTzs)),
        currency: "TZS",
        payment_methods: process.env.SELCOM_CARD_PAYMENT_METHODS || "ALL",
        redirect_url: b64(successUrl),
        cancel_url: b64(cancelUrl),
        buyer_remarks: description || "NEXORA payment",
        merchant_remarks: reference,
        no_of_items: 1,
        "billing.firstname": firstName,
        "billing.lastname": rest.join(" ") || firstName,
        "billing.address_1": buyer.address || "Dar es Salaam",
        "billing.city": buyer.city || "Dar es Salaam",
        "billing.state_or_region": buyer.region || "Dar es Salaam",
        "billing.postcode_or_pobox": buyer.postcode || "00000",
        "billing.country": "TZ",
        "billing.phone": phone,
        ...(process.env.SELCOM_PUBLIC_API_URL
            ? { webhook: b64(`${process.env.SELCOM_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1/payments/webhooks/selcom`) }
            : {})
    };

    const { ok, data } = await signedRequest("POST", "/v1/checkout/create-order", fields);

    if (!ok || !succeeded(data)) {
        throw new Error(data?.message || "Selcom checkout could not be created");
    }

    const encodedUrl = data.data?.[0]?.payment_gateway_url;
    if (!encodedUrl) {
        throw new Error("Selcom did not return a payment page URL");
    }

    return {
        success: true,
        sessionId: data.reference || reference,
        url: Buffer.from(encodedUrl, "base64").toString("utf8")
    };
};

// Order status lookup used by the stale sweep / reconciliation. Selcom's
// payment_status words: COMPLETED, PENDING, INPROGRESS, CANCELLED,
// USERCANCELLED, REJECTED.
exports.checkStatus = async (reference) => {
    const { ok, data } = await signedRequest("GET", "/v1/checkout/order-status", { order_id: reference });

    if (!ok || !data) {
        throw new Error("Selcom order status lookup failed");
    }

    const order = Array.isArray(data.data) ? data.data[0] : data.data;
    if (!order) return { state: "unknown" };

    return {
        state: classifyStatus(order.payment_status),
        providerStatus: order.payment_status,
        transactionReference: order.reference || order.transid || reference,
        amount: order.amount === undefined || order.amount === null ? null : Number(order.amount),
        currency: order.currency || "TZS"
    };
};

// Refund leg: Selcom's checkout API has no order-reversal endpoint we can rely
// on, so a refund is paid out to the buyer's own number through the payout
// path. Confirm the real path/fields for your vendor account with Selcom.
exports.refund = async (phone, amount, meta = {}) => payout("REFUND", phone, amount, meta);

// Seller withdrawal leg. Selcom's payout flow may also need the float account
// PIN - confirm the exact fields with Selcom before relying on this.
exports.disburse = async (phone, amount, meta = {}) => payout("PAYOUT", phone, amount, meta);

async function payout(kind, phone, amount, meta) {
    const { vendor } = cfg();
    const fields = {
        transid: meta.reference || `NEXORA-${kind}-${Date.now()}`,
        vendor,
        amount,
        msisdn: phone
    };

    const { ok, data } = await signedRequest("POST", "/v1/payout/process", fields);

    if (!ok) {
        return { success: false, transactionReference: null };
    }

    return {
        success: succeeded(data),
        transactionReference: data?.reference || fields.transid
    };
}
