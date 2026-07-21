/**
 * Selcom provider adapter.
 *
 * Unlike MalipoPay, Selcom signs every request with HMAC-SHA256 over a
 * fixed set of fields, plus a vendor (float account) ID. Credentials come
 * in three parts, not one:
 *
 *   MOBILE_MONEY_API_KEY      -> Selcom "API Key"
 *   MOBILE_MONEY_API_SECRET   -> Selcom "API Secret" (used to sign, never sent)
 *   MOBILE_MONEY_VENDOR_ID    -> Selcom "vendor" (float account identifier)
 *
 * IMPORTANT: the exact endpoint path and payload field names below follow
 * Selcom's publicly documented pattern (checkout / order-creation), but
 * Selcom hands out endpoint details directly when you're onboarded —
 * confirm the real path, field names, and response shape against what
 * their team gives you before going live. The signing mechanics (digest,
 * timestamp format, headers) are the part that's stable across their APIs.
 *
 * Docs: https://developers.selcommobile.com/
 */

const crypto = require("crypto");

const BASE_URL = process.env.MOBILE_MONEY_API_BASE_URL;
const API_KEY = process.env.MOBILE_MONEY_API_KEY;
const API_SECRET = process.env.MOBILE_MONEY_API_SECRET;
const VENDOR_ID = process.env.MOBILE_MONEY_VENDOR_ID;

exports.isConfigured = () => Boolean(BASE_URL && API_KEY && API_SECRET && VENDOR_ID);

// Selcom's documented timestamp format is "yyyy-dd-mm H:i:s" (day before
// month) — unusual, but that's what their own docs show. Double-check
// against a real sandbox response before trusting this in production.
const timestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getDate())}-${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const sign = (fields, ts) => {
    const orderedKeys = Object.keys(fields);
    const digestString = orderedKeys
        .map((key) => `${key}=${fields[key]}`)
        .concat(`timestamp=${ts}`)
        .join("&");

    const digest = crypto
        .createHmac("sha256", API_SECRET)
        .update(digestString)
        .digest("base64");

    return { digest, signedFields: orderedKeys.join(",") };
};

const signedRequest = async (path, fields) => {
    const ts = timestamp();
    const { digest, signedFields } = sign(fields, ts);

    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `SELCOM ${API_KEY}`,
            "Digest-Method": "HS256",
            Digest: digest,
            Timestamp: ts,
            "Signed-Fields": signedFields
        },
        body: JSON.stringify(fields)
    });

    if (!response.ok) {
        return { ok: false, data: null };
    }

    return { ok: true, data: await response.json() };
};

exports.initiate = async (phone, amount, meta = {}) => {
    const fields = {
        transid: meta.reference || `NEXORA-${Date.now()}`,
        vendor: VENDOR_ID,
        amount,
        msisdn: phone
    };

    const { ok, data } = await signedRequest("/checkout/create-order", fields);

    if (!ok) {
        return { success: false, transactionReference: null };
    }

    return {
        success: data?.resultcode === "000" || data?.result === "SUCCESS",
        transactionReference: data?.reference || fields.transid
    };
};

// Refund leg — same caveat as MalipoPay's: Selcom's real API may expose
// a dedicated order-reversal/refund endpoint distinct from a generic
// payout. This uses the payout leg (money back to the buyer's own
// msisdn) as the practical default since it requires no additional
// endpoint discovery; swap the path below if/when Selcom confirms a
// true reversal endpoint for your vendor account.
exports.refund = async (phone, amount, meta = {}) => {
    const fields = {
        transid: meta.reference || `NEXORA-REFUND-${Date.now()}`,
        vendor: VENDOR_ID,
        amount,
        msisdn: phone
    };

    const { ok, data } = await signedRequest("/payout/process", fields);

    if (!ok) {
        return { success: false, transactionReference: null };
    }

    return {
        success: data?.resultcode === "000" || data?.result === "SUCCESS",
        transactionReference: data?.reference || fields.transid
    };
};

exports.disburse = async (phone, amount, meta = {}) => {
    // Selcom's payout leg for sending money out (e.g. Qwiksend-style)
    // requires a PIN for the float account in addition to the signed
    // fields below — confirm the exact field name/flow with Selcom before
    // wiring this up for real payouts.
    const fields = {
        transid: meta.reference || `NEXORA-PAYOUT-${Date.now()}`,
        vendor: VENDOR_ID,
        amount,
        msisdn: phone
    };

    const { ok, data } = await signedRequest("/payout/process", fields);

    if (!ok) {
        return { success: false, transactionReference: null };
    }

    return {
        success: data?.resultcode === "000" || data?.result === "SUCCESS",
        transactionReference: data?.reference || fields.transid
    };
};
