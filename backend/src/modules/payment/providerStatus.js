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
    "DECLINED", "TIMEOUT", "TIMED_OUT", "VOIDED", "ABANDONED", "USERCANCELLED"
]);

exports.classifyStatus = (value) => {
    const word = norm(value);
    if (SUCCESS.has(word)) return "success";
    if (FAILURE.has(word)) return "failed";
    return "pending";
};

// Selcom's payment notification carries resultcode "000" / result "SUCCESS"
// for success and, for checkout orders, a payment_status word (COMPLETED,
// PENDING, INPROGRESS, CANCELLED, USERCANCELLED, REJECTED). Anything that is
// not clearly a terminal failure is treated as still pending.
exports.classifySelcom = (payload = {}) => {
    if (payload.payment_status) {
        return exports.classifyStatus(payload.payment_status);
    }
    if (payload.resultcode === "000" || norm(payload.result) === "SUCCESS") return "success";
    return exports.classifyStatus(payload.result) === "failed" ? "failed" : "pending";
};

// AzamPay's callback carries `transactionstatus` ("success" / "failure").
exports.classifyAzampay = (payload = {}) =>
    exports.classifyStatus(payload.transactionstatus || payload.transactionStatus || payload.status);

// PawaPay deposit callbacks carry status COMPLETED / FAILED (anything else,
// e.g. PROCESSING or IN_RECONCILIATION, is still in flight).
exports.classifyPawapay = (payload = {}) => exports.classifyStatus(payload.status);

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
