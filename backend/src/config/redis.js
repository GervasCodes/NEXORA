// Redis client for the Phase RF5 caching layer (category/department
// listings, product browse/search results). Same "degrade gracefully
// when unconfigured" pattern as sentry.js/brevo.js: with no REDIS_URL
// set, `getClient()` returns null and every caller (see utils/cache.js)
// treats that identically to a Redis outage - fall back to a direct DB
// read. Local dev and CI never need a real Redis instance.
//
// Aiven's managed Redis (matching the existing Aiven MySQL setup - see
// db.js) gives you a single `rediss://user:pass@host:port` connection
// URI with TLS already baked in, rather than separate host/port/password
// fields - so REDIS_URL is the primary/expected config shape here,
// mirroring how Aiven actually hands you the credential. ioredis parses
// the `rediss://` scheme itself and enables TLS automatically; the only
// knob usually needed on top is whether to validate Aiven's cert chain.
const Redis = require("ioredis");
const logger = require("../utils/logger").child({ module: "redis" });
const Sentry = require("./sentry");

const REDIS_URL = process.env.REDIS_URL;

// Explicit off-switch, distinct from "REDIS_URL not set" - lets an
// environment that *does* have REDIS_URL in its shared config (e.g. a
// staging env cloned from prod) still opt out of caching without having
// to unset/blank the URL itself.
const REDIS_DISABLED = process.env.REDIS_DISABLED === "true";

let client = null;
let hasLoggedUnavailable = false;

// Lazily built once per process, not per call - ioredis manages its own
// reconnection internally, so callers just need a stable reference.
//
// `overrides` lets a caller that needs different connection tuning than
// the shared cache client (see createDedicatedClient below) reuse the
// same REDIS_URL/TLS parsing without duplicating it - the cache client
// itself is just buildClient() with no overrides.
const buildClient = (overrides = {}) => {
    if (!REDIS_URL || REDIS_DISABLED) {
        return null;
    }

    const isRediss = REDIS_URL.startsWith("rediss://");

    const instance = new Redis(REDIS_URL, {
        // Aiven's cert chain validates fine by default; this only exists
        // for parity with DB_SSL_REJECT_UNAUTHORIZED (db.js) in case a
        // self-signed/dev Redis needs it relaxed.
        tls: isRediss
            ? { rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false" }
            : undefined,
        // Cache reads/writes are always on a best-effort path (see
        // utils/cache.js) - failing fast beats a request hanging behind a
        // slow reconnect loop. A handful of quick retries handles a
        // momentary blip; anything longer and callers should already have
        // fallen back to the DB well before this gives up. A dedicated
        // client (e.g. BullMQ - see createDedicatedClient) overrides this
        // with its own tuning, since a job queue's correctness
        // requirements are different from a best-effort cache's.
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 200, 2000)),
        lazyConnect: true,
        enableOfflineQueue: false,
        ...overrides
    });

    instance.on("error", (error) => {
        // ioredis emits 'error' on every failed reconnect attempt too -
        // logging every one would flood the logs during a real outage.
        // One warning per instance is enough to know it's down; the
        // real-time state is whatever getClient()'s callers observe
        // per-call anyway (see cache.js's try/catch around every op).
        if (!hasLoggedUnavailable) {
            hasLoggedUnavailable = true;
            logger.warn({ err: error }, "redis unavailable - caching layer degraded to direct DB reads");
            Sentry.captureMessage("Redis unavailable - degraded to direct DB reads", {
                level: "warning",
                tags: { area: "redis-cache" }
            });
        }
    });

    instance.on("ready", () => {
        hasLoggedUnavailable = false;
        logger.info("redis connected");
    });

    // lazyConnect defers the actual TCP/TLS handshake until first use, so
    // requiring this module never blocks app startup - connect() here is
    // fire-and-forget; a failure is handled by the 'error' listener above,
    // not by throwing out of this module.
    instance.connect().catch(() => {});

    return instance;
};

// Exposed as a function (not a plain export) so tests can jest.mock this
// module directly without needing a live connection, and so the client is
// only ever constructed once, on first real use, rather than at
// require-time.
exports.getClient = () => {
    if (!REDIS_URL || REDIS_DISABLED) {
        return null;
    }
    if (!client) {
        client = buildClient();
    }
    return client;
};

exports.isConfigured = () => Boolean(REDIS_URL) && !REDIS_DISABLED;

// A second, independent connection for callers that can't share the
// cache client's tuning (see the maxRetriesPerRequest/enableOfflineQueue
// comment above) - currently just BullMQ (queues/dispatchQueue.js),
// which needs `maxRetriesPerRequest: null` and an enabled offline queue
// per its own connection requirements. Same "returns null when
// unconfigured" contract as getClient() - callers decide their own
// degraded behavior (see dispatchQueue.js), this module doesn't.
// Deliberately not memoized/shared like getClient()'s singleton: BullMQ
// wants its own connection per Queue/Worker instance rather than one
// shared client.
exports.createDedicatedClient = (overrides = {}) => buildClient(overrides);
