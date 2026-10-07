// Turns each provider's raw status vocabulary into one of three outcomes:
//   "success"  - a confirmed terminal success
//   "failed"   - a confirmed terminal failure
//   "pending"  - anything else (PENDING, PROCESSING, unknown words...) - the
//                caller must IGNORE it, never mark the payment failed.
//
// Only words that genuinely mean "this attempt is over and no money moved"
// are listed as failures. The vocabularies come from each provider's public
// docs / typical shapes and should be confirmed in the provider sandbox.

const norm = (value) => String(value ?? "").trim().toUpperCase();

const SUCCESS = new Set(["SUCCESS", "SUCCESSFUL", "SUCCEEDED", "COMPLETED", "PAID", "SETTLED"]);
const FAILURE = new Set([
    "FAILED", "FAILURE", "FAIL", "CANCELLED", "CANCELED", "EXPIRED", "REJECTED",
    "DECLINED", "TIMEOUT", "TIMED_OUT", "VOIDED", "ABANDONED"
]);

exports.classifyStatus = (value) => {
    const word = norm(value);
    if (SUCCESS.has(word)) return "success";
    if (FAILURE.has(word)) return "failed";
    return "pending";
};

exports.classifyMalipopay = (payload = {}) => exports.classifyStatus(payload.status);

// Selcom's documented notification carries resultcode "000" / result
// "SUCCESS" for success; anything that is not clearly a terminal failure
// word is treated as still pending.
exports.classifySelcom = (payload = {}) => {
    if (payload.resultcode === "000" || norm(payload.result) === "SUCCESS") return "success";
    return exports.classifyStatus(payload.result) === "failed" ? "failed" : "pending";
};

// Hosted-checkout events (Snippe, MalipoPay Card). Returns
// { kind: "success" | "failed" | "chargeback" | "ignore", ... }.
exports.classifyCheckoutEvent = (event = {}) => {
    const type = String(event.type || "").toLowerCase();
    const session = event.data || event.session || event;
    const reference = session.reference || session.client_reference_id || null;
    const transactionReference = session.payment_id || session.id || null;

    const rawAmount = session.amount_total ?? session.amount_paid ?? session.amount ?? null;
    const reportedAmount = rawAmount === null || rawAmount === "" || Number.isNaN(Number(rawAmount)) ? null : Number(rawAmount);
    const reportedCurrency = session.currency ? norm(session.currency) : null;

    const base = { reference, transactionReference, reportedAmount, reportedCurrency };

    if (/dispute|chargeback/.test(type)) {
        return { ...base, kind: "chargeback", reason: session.reason || session.dispute_reason || type };
    }

    if (/expired|failed|cancel|declin|denied/.test(type)) {
        return { ...base, kind: "failed" };
    }

    if (type === "checkout.session.completed" || type === "payment.completed" || type === "payment.succeeded") {
        const state = exports.classifyStatus(session.payment_status || session.status);
        if (state === "success") return { ...base, kind: "success" };
        if (state === "failed") return { ...base, kind: "failed" };
        // "completed" session whose payment_status is unpaid / processing
        // (e.g. an async method still settling) is NOT a payment yet.
        return { ...base, kind: "ignore" };
    }

    return { ...base, kind: "ignore" };
};

// Small tolerance: max(1 TZS, PAYMENT_AMOUNT_TOLERANCE_PERCENT of the
// expected amount, default 0.5%). Anything outside goes to admin review
// instead of being marked paid.
exports.amountsMatch = (expected, reported, { percent } = {}) => {
    const expectedNumber = Number(expected);
    const reportedNumber = Number(reported);
    if (!Number.isFinite(expectedNumber) || !Number.isFinite(reportedNumber)) return false;

    const tolerancePercent = percent ?? (Number(process.env.PAYMENT_AMOUNT_TOLERANCE_PERCENT) || 0.5);
    const tolerance = Math.max(1, Math.abs(expectedNumber) * (tolerancePercent / 100));
    return Math.abs(expectedNumber - reportedNumber) <= tolerance;
};

// PayPal amounts are in cents of a dollar, so the floor is 2 cents.
exports.usdAmountsMatch = (expected, reported) => {
    const expectedNumber = Number(expected);
    const reportedNumber = Number(reported);
    if (!Number.isFinite(expectedNumber) || !Number.isFinite(reportedNumber)) return false;
    const tolerance = Math.max(0.02, Math.abs(expectedNumber) * 0.005);
    return Math.abs(expectedNumber - reportedNumber) <= tolerance;
};
