/**
 * Dispute SLA (Phase 5).
 *
 * Three checks, each run once per tick:
 *  1. Notify admins once when an open/under_review dispute crosses 12h
 *     old with no resolution yet.
 *  2. Same again at 20h - a second, more urgent nudge before a dispute
 *     would hit a typical 24h expectation.
 *  3. Flag (and notify admins about) a dispute whose seller hasn't sent
 *     a single reply within dispute_seller_response_hours (default 72h,
 *     a platform_settings value). Policy for what happens next is
 *     intentionally just "flag + notify an admin" - no automatic refund
 *     or resolution is taken on the seller's behalf (see the
 *     "Decision needed" note this phase shipped with for the fuller
 *     policy question).
 *
 * Each checkpoint is only ever notified once per dispute (the relevant
 * *_notified_at / seller_response_overdue column guards that), so this
 * job is safe to run on a short interval.
 */

const disputeRepository = require("../modules/dispute/dispute.repository");
const settingsService = require("../modules/settings/settings.service");
const adminNotificationService = require("../modules/adminNotification/adminNotification.service");
const logger = require("../utils/logger").child({ module: "job:disputeSla" });

exports.run = async () => {
    const [at12h, at20h] = await Promise.all([
        disputeRepository.findUnnotifiedAtCheckpoint(12, "sla_12h_notified_at"),
        disputeRepository.findUnnotifiedAtCheckpoint(20, "sla_20h_notified_at")
    ]);

    for (const d of at12h) {
        await adminNotificationService.notify({
            type: "dispute_sla_12h",
            category: "moderation",
            severity: "info",
            title: "Dispute open 12h with no resolution",
            message: `Dispute ${d.dispute_number} has been open for 12 hours.`,
            metadata: { dispute_id: d.id, order_id: d.order_id }
        }).catch((err) => logger.warn({ err, disputeId: d.id }, "12h SLA notify error"));
        await disputeRepository.markCheckpointNotified(d.id, "sla_12h_notified_at");
    }

    for (const d of at20h) {
        await adminNotificationService.notify({
            type: "dispute_sla_20h",
            category: "moderation",
            severity: "warning",
            title: "Dispute open 20h with no resolution",
            message: `Dispute ${d.dispute_number} has been open for 20 hours and still needs a decision.`,
            metadata: { dispute_id: d.id, order_id: d.order_id }
        }).catch((err) => logger.warn({ err, disputeId: d.id }, "20h SLA notify error"));
        await disputeRepository.markCheckpointNotified(d.id, "sla_20h_notified_at");
    }

    const responseHours = await settingsService.getDisputeSellerResponseHours();
    const overdue = await disputeRepository.findOverdueForSellerResponse(responseHours);

    for (const d of overdue) {
        await disputeRepository.markSellerResponseOverdue(d.id);
        await adminNotificationService.notify({
            type: "dispute_seller_overdue",
            category: "moderation",
            severity: "warning",
            title: "Seller hasn't responded to a dispute",
            message: `Dispute ${d.dispute_number} (order ${d.order_number}) has had no seller response within ${responseHours}h.`,
            metadata: { dispute_id: d.id, order_id: d.order_id, seller_id: d.seller_id }
        }).catch((err) => logger.warn({ err, disputeId: d.id }, "seller-overdue notify error"));
    }

    if (at12h.length || at20h.length || overdue.length) {
        logger.info({ at12h: at12h.length, at20h: at20h.length, overdue: overdue.length }, "dispute SLA sweep");
    }
};
