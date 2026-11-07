const paymentReviewRepository = require("./paymentReview.repository");
const auditService = require("../audit/audit.service");
const adminNotificationService = require("../adminNotification/adminNotification.service");
const logger = require("../../utils/logger").child({ module: "payment-review" });
const Sentry = require("../../config/sentry");

// Reasons a payment can land in the admin queue. Plain strings (not an
// ENUM) so a later phase can add one without a migration.
exports.REASONS = {
    PAID_AFTER_CANCEL: "paid_after_cancel",
    DUPLICATE_PAYMENT: "duplicate_payment",
    AMOUNT_MISMATCH: "amount_mismatch",
    NOT_APPLICABLE: "not_applicable",
    APPLY_FAILED: "apply_failed",
    PROVIDER_COMPLETED_NOT_HERE: "provider_completed_not_here",
    CHARGEBACK: "chargeback",
    CHARGEBACK_SHORTFALL: "chargeback_shortfall"
};

const TITLES = {
    paid_after_cancel: "Payment received for a cancelled order",
    duplicate_payment: "Duplicate payment received",
    amount_mismatch: "Payment amount does not match",
    not_applicable: "Payment received but could not be applied",
    apply_failed: "Payment received but applying it failed",
    provider_completed_not_here: "Completed at provider, not completed here",
    chargeback: "Chargeback / dispute on a card payment",
    chargeback_shortfall: "Chargeback reversal left a shortfall"
};

// Raises (or refreshes) a review item for a payment, and - only the first
// time - alerts admins, logs to Sentry and writes the audit trail. Never
// throws: flagging a payment must not be the thing that makes a webhook
// fail, but every failure to flag is itself logged loudly.
exports.flag = async ({ payment, reason, details = {}, severity = "warning" }) => {
    const title = TITLES[reason] || "Payment needs review";

    try {
        const { isNew } = await paymentReviewRepository.upsert({ paymentId: payment.id, reason, details });

        if (isNew) {
            const summary = `${title} (payment #${payment.id}, ${payment.purpose || "payment"}, TZS ${payment.amount}).`;

            logger.warn({ paymentId: payment.id, reason, details }, "payment flagged for admin review");
            Sentry.captureMessage(`Payment flagged for review: ${reason}`, {
                level: "warning",
                tags: { area: "payment-review", reason },
                extra: { paymentId: payment.id, details }
            });

            auditService.log({
                eventType: "payment_review_flagged",
                description: summary,
                metadata: { paymentId: payment.id, reason, ...details }
            });

            adminNotificationService.notify({
                type: "payment_review",
                category: "security",
                severity,
                title,
                message: summary,
                metadata: { paymentId: payment.id, reason },
                relatedUserId: payment.seller_id || null
            });
        }

        return { flagged: true, isNew };
    } catch (error) {
        logger.error({ err: error, paymentId: payment.id, reason }, "failed to flag payment for review");
        Sentry.captureException(error, { tags: { area: "payment-review", stage: "flag" }, extra: { paymentId: payment.id, reason } });
        return { flagged: false, isNew: false };
    }
};

exports.list = async (query = {}) => {
    const [items, openCount] = await Promise.all([
        paymentReviewRepository.list({
            status: query.status === "resolved" ? "resolved" : "open",
            limit: Math.min(Number(query.limit) || 100, 200),
            offset: Number(query.offset) || 0
        }),
        paymentReviewRepository.countOpen()
    ]);

    return { items, openCount };
};

exports.countOpen = () => paymentReviewRepository.countOpen();

exports.resolve = async (id, adminId, note) => {
    const item = await paymentReviewRepository.findById(id);
    if (!item) throw new Error("Review item not found");
    if (item.status !== "open") throw new Error("This review item is already resolved");

    await paymentReviewRepository.resolve(id, adminId, note);

    auditService.log({
        eventType: "payment_review_resolved",
        description: `Payment review #${id} (${item.reason}) resolved`,
        metadata: { reviewId: id, paymentId: item.payment_id, reason: item.reason, note: note || null },
        userId: adminId
    });

    return { id, resolved: true };
};
