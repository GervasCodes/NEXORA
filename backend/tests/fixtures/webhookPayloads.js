// Phase 7 (Security) - canonical sample payloads for MalipoPay's and
// Selcom's webhook callbacks, matching the shapes documented publicly at
// developers.malipopay.co.tz/integration/webhooks and
// developers.selcommobile.com's C2B/Collection Services section
// (re-confirmed 2026-08-02 - see docs/WEBHOOK_VALIDATION.md §1/§6 for
// the full writeup, including the honest caveat that full webhook-payload
// docs for both providers sit behind a business/merchant login this repo
// doesn't have access to, so this is "best available public docs plus
// what the existing integration tests already exercise", not a
// confirmed live-sandbox capture).
//
// These aren't wired into any test file - the existing inline payloads
// in backend/tests/integration/payment.webhooks.test.js already cover
// that and are left untouched (Phase 7 doesn't touch test files - see
// README-phase-P7.md). This file exists so there's one canonical,
// documented place to look at "what does a real MalipoPay/Selcom webhook
// body look like" without re-deriving it from test setup code, and so a
// future test file (or a manual sandbox smoke test) has something to
// import instead of writing its own copy.

const crypto = require("crypto");

// --- MalipoPay ------------------------------------------------------------
// payloadSignature = SHA256(reference + timestamp + amount + phoneNumber + secret)
// secret = the same MOBILE_MONEY_API_KEY used as the outbound `apiToken`
// header (malipopay.provider.js) - MalipoPay issues one project key, not
// a separate secret/key pair.
function signMalipopay({ reference, timestamp, amount, phoneNumber }, secret) {
    return crypto
        .createHash("sha256")
        .update(`${reference}${timestamp}${amount}${phoneNumber}${secret}`)
        .digest("hex");
}

// yyyyMMddHHmmss, UTC - MalipoPay's documented timestamp format. Callers
// should regenerate this at use-time (see webhookReplayGuard's freshness
// window) rather than hardcoding a fixed value here, which would go
// stale the moment it falls outside that window.
function malipopayTimestampNow() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

// Builds a fully-signed sample MalipoPay callback body for a successful
// mobile-money payment against order #<n>. `secret` must match whatever
// MOBILE_MONEY_API_KEY is configured in the environment this fixture is
// used in - the signature is only valid for that one secret.
function buildMalipopaySuccessPayload({ orderId = 1, amount = 10000, phoneNumber = "255655128812", secret }) {
    const base = {
        reference: `ORDER-${orderId}`,
        timestamp: malipopayTimestampNow(),
        amount,
        status: "SUCCESS",
        customer: { firstname: "John", lastname: "Doe", phoneNumber, mno: "Tigo" }
    };
    return { ...base, payloadSignature: signMalipopay({ ...base, phoneNumber }, secret) };
}

// --- Selcom -----------------------------------------------------------
// C2B Payment Notification shape - no payload signature/nonce of its own
// (see docs/WEBHOOK_VALIDATION.md §1's Selcom section); authenticated
// entirely via the static `Authorization: Bearer <SELCOM_WEBHOOK_SECRET>`
// header instead, applied by the caller, not part of the body below.
function buildSelcomSuccessPayload({ orderId = 1, transid } = {}) {
    return {
        transid: transid || `SEL-TXN-${orderId}`,
        reference: `ORDER-${orderId}`,
        resultcode: "000",
        result: "SUCCESS"
    };
}

module.exports = {
    signMalipopay,
    malipopayTimestampNow,
    buildMalipopaySuccessPayload,
    buildSelcomSuccessPayload
};
