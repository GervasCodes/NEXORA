// Phase 1 (Durable Dispatch Foundation): BullMQ-backed replacement for
// the old `setTimeout(() => expireAndAdvance(...), OFFER_TIMEOUT_MS)`
// timer that used to live directly in delivery.service.js. A bare
// setTimeout only exists in the memory of whatever process created it -
// a deploy/restart mid-offer silently drops the expiry, leaving that
// order's offer stuck "offered" forever with nobody left to advance it
// to the next candidate/radius. BullMQ persists the delayed job in
// Redis instead, so:
//   - the timer survives a restart (it's read back out of Redis, not
//     recreated from in-memory state that no longer exists), and
//   - with multiple server instances running, the job is still only
//     ever picked up and completed by exactly one of them - BullMQ's own
//     locking handles that, so every instance can safely run a Worker
//     (see startDispatchWorker, called from both server.js and
//     worker.js) purely for extra consumer capacity/redundancy, without
//     any risk of double-processing a single offer's expiry.
//
// This is the one place BullMQ is wired up for dispatch; delivery.service.js
// only talks to the small surface exported here (getQueue/JOB_NAMES) and
// never touches ioredis or BullMQ directly.
const { Queue, Worker } = require("bullmq");
const redisConfig = require("../config/redis");
const logger = require("../utils/logger").child({ module: "dispatchQueue" });
const Sentry = require("../config/sentry");

const QUEUE_NAME = "delivery-dispatch";

exports.JOB_NAMES = {
    OFFER_EXPIRE: "offer-expire"
};

let queue = null;
let worker = null;

// BullMQ needs its own dedicated ioredis connection - it requires
// `maxRetriesPerRequest: null` (it manages its own retry/backoff for the
// blocking commands it issues internally) and an enabled offline queue,
// which is the opposite of how the shared cache client in config/redis.js
// is tuned (fail-fast, no offline queueing - see that file). Using
// createDedicatedClient() here reuses the same REDIS_URL/TLS parsing
// without duplicating it, while keeping this connection's lifecycle and
// tuning completely independent of the caching layer's - a cache-client
// reconnect storm can't stall a dispatch timer, and vice versa.
const getConnection = () => redisConfig.createDedicatedClient({
    maxRetriesPerRequest: null,
    enableOfflineQueue: true
});

// Lazily built on first real use (the first offer ever created in this
// process), not at require-time - same reasoning as config/redis.js's
// own getClient(): requiring this module must never depend on Redis
// being reachable yet. Returns null when Redis isn't configured at all
// (see config/redis.js#isConfigured) - delivery.service.js's caller is
// responsible for the degraded (non-durable) fallback in that case, this
// module just reports "no queue available".
exports.getQueue = () => {
    if (!redisConfig.isConfigured()) return null;
    if (!queue) {
        queue = new Queue(QUEUE_NAME, { connection: getConnection() });
    }
    return queue;
};

// Registers the handlers that process due jobs and starts consuming.
// `handlers` is a { [jobName]: async (data) => void } map - passed in by
// the caller (server.js / worker.js) rather than required directly here,
// so this module never needs to import delivery.service.js (which would
// be a pointless indirection back through the same layer that calls
// getQueue() above).
//
// Safe to call from more than one process - see the file-level comment.
// No-ops (and logs once) if Redis isn't configured: offers created while
// Redis is unreachable fall back to the non-durable setTimeout path in
// delivery.service.js, and there is nothing for a Worker to consume from
// in that case anyway.
exports.startDispatchWorker = (handlers) => {
    if (!redisConfig.isConfigured()) {
        logger.warn(
            "REDIS_URL not configured - durable dispatch offer-expiry is disabled; " +
            "offers will fall back to a non-durable in-process timer (see delivery.service.js)"
        );
        return null;
    }

    if (worker) return worker;

    worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const handler = handlers[job.name];
            if (!handler) {
                logger.warn({ jobName: job.name }, "no handler registered for dispatch job");
                return;
            }
            await handler(job.data);
        },
        { connection: getConnection() }
    );

    worker.on("failed", (job, err) => {
        logger.error({ err, jobId: job?.id, jobName: job?.name }, "dispatch job failed");
        Sentry.captureException(err, {
            tags: { area: "delivery", stage: "dispatch-queue" },
            extra: { jobId: job?.id, jobName: job?.name }
        });
    });

    logger.info("dispatch queue worker started");

    return worker;
};
