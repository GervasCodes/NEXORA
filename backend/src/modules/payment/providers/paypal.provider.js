/**
 * PayPal provider - Orders v2 REST API (create + capture), used for the
 * same two purposes as snippe.provider.js: order checkout and the
 * seller verification fee.
 *
 * IMPORTANT: unlike Snippe, PayPal does NOT support TZS as a transaction
 * currency. Every amount here is converted to USD first, using the
 * admin-editable `usd_exchange_rate` platform setting (TZS per 1 USD -
 * see settings.service.js). This is a coarse approximation, not a live
 * FX feed - the USD amount actually charged is stored on the payment
 * record (see payment.repository.js) alongside the original TZS amount,
 * so receipts and reconciliation always show both.
 *
 * Flow (redirect-based, no PayPal SDK dependency - plain REST + fetch):
 *   1. createOrder() -> buyer is redirected to the returned `approveUrl`
 *   2. buyer approves on PayPal's site, PayPal redirects back to our
 *      return_url with ?token=<paypal order id>
 *   3. our frontend calls our own capture endpoint, which calls
 *      captureOrder() here to actually take the funds server-side -
 *      never trust the redirect alone as proof of payment.
 */

const BASE_URLS = {
    sandbox: "https://api-m.sandbox.paypal.com",
    live: "https://api-m.paypal.com"
};

const baseUrl = () => BASE_URLS[(process.env.PAYPAL_MODE || "sandbox").toLowerCase()] || BASE_URLS.sandbox;

const PAYPAL_ORDER_ID = /^[A-Za-z0-9-]{10,40}$/;

// The id ends up in a URL path, so anything that is not a plain PayPal
// order id is rejected before a request is built.
exports.assertValidOrderId = (paypalOrderId) => {
    if (typeof paypalOrderId !== "string" || !PAYPAL_ORDER_ID.test(paypalOrderId)) {
        throw new Error("Invalid PayPal order id");
    }
};

exports.isConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const getAccessToken = async () => {
    if (!exports.isConfigured()) {
        throw new Error("PayPal is not configured");
    }

    const credentials = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });

    if (!response.ok) {
        throw new Error("Could not authenticate with PayPal");
    }

    const data = await response.json();
    return data.access_token;
};

// amountTzs: decimal TZS amount. usdExchangeRate: TZS per 1 USD (from
// settingsService.getUsdExchangeRate() - passed in rather than read here
// to keep this module free of a dependency on the settings module).
exports.createOrder = async ({ amountTzs, usdExchangeRate, reference, description, returnUrl, cancelUrl }) => {
    const usdAmount = Number((Number(amountTzs) / usdExchangeRate).toFixed(2));

    const accessToken = await getAccessToken();

    const response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: reference,
                    custom_id: reference,
                    description: description || "NEXORA payment",
                    amount: {
                        currency_code: "USD",
                        value: usdAmount.toFixed(2)
                    }
                }
            ],
            application_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl,
                user_action: "PAY_NOW"
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "PayPal order could not be created");
    }

    const approveLink = (data.links || []).find((link) => link.rel === "approve");

    return {
        success: true,
        paypalOrderId: data.id,
        approveUrl: approveLink?.href,
        usdAmount
    };
};

// Issues that mean PayPal definitely refused to take the money. Anything
// else that goes wrong (timeout, 5xx, ORDER_ALREADY_CAPTURED, ...) is NOT a
// decline - see the "unknown" state below.
const DEFINITE_DECLINES = new Set(["INSTRUMENT_DECLINED", "TRANSACTION_REFUSED", "PAYER_CANNOT_PAY", "DUPLICATE_INVOICE_ID_DECLINED"]);

const readCapture = (data) => {
    const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
    return {
        captureId: capture?.id || null,
        captureStatus: capture?.status || null,
        amount: capture?.amount ? Number(capture.amount.value) : undefined,
        currency: capture?.amount?.currency_code
    };
};

// Actually takes the funds. Only trust this result, never the frontend
// redirect alone, as proof a PayPal payment succeeded.
//
// Returns { state, ... } where state is:
//   "success" - captured (COMPLETED)
//   "pending" - PayPal accepted it but it has not settled (capture PENDING)
//   "failed"  - a definite decline
//   "unknown" - anything else; the caller must re-fetch the order (getOrder)
//               before writing a terminal state.
// `requestId` becomes the PayPal-Request-Id header, so retrying the same
// capture can never take the money twice.
exports.captureOrder = async (paypalOrderId, { requestId } = {}) => {
    exports.assertValidOrderId(paypalOrderId);

    let response;
    let data = {};

    try {
        const accessToken = await getAccessToken();

        response = await fetch(`${baseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                ...(requestId ? { "PayPal-Request-Id": String(requestId).slice(0, 108) } : {})
            }
        });
        data = await response.json().catch(() => ({}));
    } catch (error) {
        return { state: "unknown", error: error.message };
    }

    const { captureId, captureStatus, amount, currency } = readCapture(data);
    const base = { reference: data.purchase_units?.[0]?.reference_id, transactionReference: captureId || paypalOrderId, amount, currency, raw: data };

    if (response.ok && data.status === "COMPLETED") {
        if (captureStatus === "COMPLETED" || captureStatus === null) return { ...base, state: "success" };
        if (captureStatus === "PENDING") return { ...base, state: "pending" };
        if (captureStatus === "DECLINED" || captureStatus === "FAILED") return { ...base, state: "failed" };
        return { ...base, state: "unknown" };
    }

    const issues = (data.details || []).map((detail) => detail.issue);
    if (!response.ok && issues.some((issue) => DEFINITE_DECLINES.has(issue))) {
        return { ...base, state: "failed" };
    }

    return { ...base, state: "unknown" };
};

// Read-only status of a PayPal order, used to settle an unclear capture and
// by the stale sweep / reconciliation. Throws on a transport error.
exports.getOrder = async (paypalOrderId) => {
    exports.assertValidOrderId(paypalOrderId);
    const accessToken = await getAccessToken();

    const response = await fetch(`${baseUrl()}/v2/checkout/orders/${paypalOrderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || `PayPal order lookup failed (${response.status})`);
    }

    const { captureId, captureStatus, amount, currency } = readCapture(data);
    const base = {
        providerStatus: data.status,
        transactionReference: captureId || paypalOrderId,
        amount,
        currency,
        reference: data.purchase_units?.[0]?.reference_id
    };

    if (data.status === "COMPLETED") {
        if (captureStatus === "PENDING") return { ...base, state: "pending" };
        if (captureStatus === "DECLINED" || captureStatus === "FAILED") return { ...base, state: "failed" };
        return { ...base, state: "success" };
    }
    if (data.status === "VOIDED") return { ...base, state: "failed" };
    return { ...base, state: "pending" };
};

// Verifies a webhook delivery with PayPal's own verification endpoint
// (needs PAYPAL_WEBHOOK_ID from the PayPal dashboard). Fails closed: any
// error or a missing id means "not verified".
exports.verifyWebhookSignature = async (headers, event) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || !exports.isConfigured()) return false;

    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return false;

    try {
        const accessToken = await getAccessToken();
        const response = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                auth_algo: authAlgo,
                cert_url: certUrl,
                transmission_id: transmissionId,
                transmission_sig: transmissionSig,
                transmission_time: transmissionTime,
                webhook_id: webhookId,
                webhook_event: event
            })
        });
        const data = await response.json().catch(() => ({}));
        return response.ok && data.verification_status === "SUCCESS";
    } catch (error) {
        return false;
    }
};

// Refund leg (Refund Automation). Refunds a previously
// captured payment via PayPal's documented Payments v2 API
// (POST /v2/payments/captures/{capture_id}/refund). captureId is the
// value stored as payments.transaction_reference for a PayPal payment
// (see captureOrder() above / payment.service.js). Omitting `amount`
// in the request body means "refund the full captured amount" per
// PayPal's API - pass amountUsd for a partial refund.
exports.refundCapture = async (captureId, amountUsd = null) => {
    const accessToken = await getAccessToken();

    const body = amountUsd
        ? { amount: { currency_code: "USD", value: Number(amountUsd).toFixed(2) } }
        : {};

    const response = await fetch(`${baseUrl()}/v2/payments/captures/${captureId}/refund`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    const succeeded = response.ok && (data.status === "COMPLETED" || data.status === "PENDING");

    return {
        success: succeeded,
        refundReference: data.id || null,
        error: succeeded ? null : (data.message || data.details?.[0]?.description || "PayPal refund failed")
    };
};
