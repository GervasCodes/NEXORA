/**
 * AzamPay provider adapter.
 *
 * Phase 5 (Resilience & Growth) — additional payment-rail preparation.
 * This is the third mobile-money rail invited by the comment at the top
 * of mobileMoney.provider.js ("Adding a third provider later e.g.
 * AzamPay"). It follows the exact same adapter shape as malipopay.provider.js
 * and selcom.provider.js so mobileMoney.provider.js's router can treat all
 * three identically.
 *
 * AzamPay's auth is a short-lived bearer token fetched from a separate
 * token endpoint (not a static header like MalipoPay, not a per-request
 * HMAC signature like Selcom) — one more shape of "how do I authenticate"
 * that the abstraction layer has to tolerate without leaking into
 * payment.service.js, which never sees any of this.
 *
 *   AZAMPAY_API_BASE_URL     -> AzamPay checkout/API base URL
 *   AZAMPAY_APP_NAME         -> AzamPay "App Name" (from their dashboard)
 *   AZAMPAY_CLIENT_ID        -> AzamPay client ID (used to fetch a token)
 *   AZAMPAY_CLIENT_SECRET    -> AzamPay client secret (used to fetch a token)
 *
 * IMPORTANT: this is prepared, not activated. isConfigured() returns false
 * until all four env vars above are set, and even then it is inert until
 * an operator opts in via MOBILE_MONEY_PROVIDER=azampay (see
 * mobileMoney.provider.js) — so shipping this file changes no existing
 * behavior for anyone not already using it. Confirm the exact endpoint
 * paths and response field names against AzamPay's own docs/onboarding
 * package before ever setting MOBILE_MONEY_PROVIDER=azampay in production;
 * the shape below follows their publicly documented checkout pattern.
 *
 * Docs: https://developers.azampay.co.tz/
 */

const BASE_URL = process.env.AZAMPAY_API_BASE_URL;
const APP_NAME = process.env.AZAMPAY_APP_NAME;
const CLIENT_ID = process.env.AZAMPAY_CLIENT_ID;
const CLIENT_SECRET = process.env.AZAMPAY_CLIENT_SECRET;

exports.isConfigured = () => Boolean(BASE_URL && APP_NAME && CLIENT_ID && CLIENT_SECRET);

// Token is short-lived and only ever needed inside this file — nothing
// outside this adapter ever sees or handles an AzamPay bearer token.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

const getAccessToken = async () => {
    if (cachedToken && Date.now() < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const response = await fetch(`${BASE_URL}/AppRegistration/GenerateToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            appName: APP_NAME,
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET
        })
    });

    if (!response.ok) {
        throw new Error("AzamPay: failed to obtain access token");
    }

    const data = await response.json();
    cachedToken = data.data?.accessToken || data.accessToken;
    // Refresh a little early rather than risk using a token that expires
    // mid-request — 5 minutes of headroom on whatever lifetime is quoted.
    const expiresInSeconds = Number(data.data?.expire || data.expiresIn || 3300);
    cachedTokenExpiresAt = Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000;

    return cachedToken;
};

exports.initiate = async (phone, amount, meta = {}) => {
    const token = await getAccessToken();

    const response = await fetch(`${BASE_URL}/azampay/mno/checkout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            accountNumber: phone,
            amount,
            currency: "TZS",
            externalId: meta.reference || `NEXORA-${Date.now()}`,
            provider: meta.mno || "Airtel"
        })
    });

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    // AzamPay's checkout response shape — confirm exact field names
    // against your dashboard/sandbox response before going live, same
    // caveat as malipopay.provider.js and selcom.provider.js above.
    return {
        success: Boolean(data.success ?? data.status === "success" ?? data.status === "Success"),
        transactionReference: data.transactionId || data.reference || data.data?.transactionId || null
    };
};

// Refund leg — like MalipoPay, AzamPay's commonly documented API has no
// dedicated collection-reversal endpoint, so this is a disbursement back
// to the buyer's own phone for the refunded amount (see the equivalent
// note in malipopay.provider.js).
exports.refund = async (phone, amount, meta = {}) => {
    const token = await getAccessToken();

    const response = await fetch(`${BASE_URL}/azampay/mno/disburse`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            accountNumber: phone,
            amount,
            currency: "TZS",
            externalId: meta.reference || `NEXORA-REFUND-${Date.now()}`,
            provider: meta.mno || "Airtel"
        })
    });

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    return {
        success: Boolean(data.success ?? data.status === "success" ?? data.status === "Success"),
        transactionReference: data.transactionId || data.reference || data.data?.transactionId || null
    };
};

// Payout / seller-withdrawal leg — same disbursement endpoint, mirrors
// malipopay.provider.js#disburse.
exports.disburse = async (phone, amount, meta = {}) => {
    const token = await getAccessToken();

    const response = await fetch(`${BASE_URL}/azampay/mno/disburse`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            accountNumber: phone,
            amount,
            currency: "TZS",
            externalId: meta.reference || `NEXORA-PAYOUT-${Date.now()}`,
            provider: meta.mno || "Airtel"
        })
    });

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    return {
        success: Boolean(data.success ?? data.status === "success" ?? data.status === "Success"),
        transactionReference: data.transactionId || data.reference || data.data?.transactionId || null
    };
};
