const deliveryRepository = require("../modules/delivery/delivery.repository");
const deliveryService = require("../modules/delivery/delivery.service");
const logger = require("../utils/logger").child({ module: "job:deliveryRematch" });
const Sentry = require("../config/sentry");

// Phase 1 (Durable Dispatch Foundation): an order that exhausted every
// configured search radius (see delivery.service.js#offerToNextCandidate)
// lands in the manual "available for pickup" pool and, before this job,
// only got matched again if some *other* coincidental event (a new order
// shipping and happening to trigger startMatching, an agent app polling
// mid-request) indirectly re-triggered matching for it. This sweeps that
// pool on a schedule instead, so a stuck order keeps periodically
// re-attempting on its own even with no new activity elsewhere on the
// platform. Modeled on staleOrders.job.js's shape: a sweep query, then a
// per-row try/catch so one bad row can't stop the rest of the sweep.
exports.run = async () => {
    const unmatched = await deliveryRepository.findUnmatchedForRematch();

    let rematched = 0;
    for (const row of unmatched) {
        try {
            // Always retried from the smallest radius step - see
            // startMatching's own comment on why that's cheap and
            // correct even on a re-check (empty radii are skipped
            // instantly rather than waited out).
            await deliveryService.startMatching(row.order_id);
            rematched += 1;
        } catch (error) {
            logger.error({ err: error, orderId: row.order_id }, "failed to re-attempt dispatch matching");
            Sentry.captureException(error, {
                tags: { area: "job:deliveryRematch" },
                extra: { orderId: row.order_id }
            });
        }
    }

    if (unmatched.length) {
        logger.info({ candidates: unmatched.length, rematched }, "manual-pool orders re-swept for dispatch matching");
    }
};
