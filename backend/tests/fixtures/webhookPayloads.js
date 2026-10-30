// Canonical sample payloads for the AzamPay, Selcom and PawaPay webhook
// callbacks, matching the shapes the handlers in payment.controller.js read
// (see docs/WEBHOOK_VALIDATION.md). Not a confirmed live-sandbox capture -
// check them against each gateway's sandbox before go-live.
//
// These aren't wired into any test file; they exist so there is one
// documented place to look at "what does a webhook body look like" and so a
// future test or sandbox smoke test can import them.

// --- AzamPay ----------------------------------------------------------
// No signature in the body; authenticity is the shared secret, sent as
// `Authorization: Bearer <AZAMPAY_WEBHOOK_SECRET>`, `x-webhook-secret`, or
// `?secret=` on the callback URL (applied by the caller).
function buildAzampaySuccessPayload({ orderId = 1, amount = 10000, phoneNumber = "255655128812", transactionId } = {}) {
    return {
        utilityref: `ORDER-${orderId}`,
        transactionstatus: "success",
        amount: String(amount),
        reference: transactionId || `AZ-TXN-${orderId}`,
        msisdn: phoneNumber
    };
}

// --- Selcom -----------------------------------------------------------
// C2B payment notification - authenticated entirely via the static
// `Authorization: Bearer <SELCOM_WEBHOOK_SECRET>` header, applied by the
// caller, not part of the body below.
function buildSelcomSuccessPayload({ orderId = 1, transid } = {}) {
    return {
        transid: transid || `SEL-TXN-${orderId}`,
        reference: `ORDER-${orderId}`,
        resultcode: "000",
        result: "SUCCESS"
    };
}

// --- PawaPay ----------------------------------------------------------
// Deposit callback. Sent as raw JSON with RFC 9421 signature headers; the
// depositId is the deterministic UUID derived from our payment reference.
function buildPawapayDepositPayload({ depositId, status = "COMPLETED", amount = "10000" } = {}) {
    return {
        depositId: depositId || "11111111-1111-4111-8111-111111111111",
        status,
        depositedAmount: amount,
        currency: "TZS"
    };
}

module.exports = {
    buildAzampaySuccessPayload,
    buildSelcomSuccessPayload,
    buildPawapayDepositPayload
};
