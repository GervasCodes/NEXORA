// Read-through cache for public, browse-style data (category/department
// listings, product browse/search results - see category.service.js and
// product.service.js). Deliberately NOT used anywhere near live inventory
// counts, checkout pricing, or payments - those stay on direct DB reads,
// per the Phase RF5 plan.
//
// Invalidation strategy: versioned keys, not key deletion. Every cache key
// is built as `<namespace>:v<version>:<rest>`; a write bumps the
// namespace's version counter, which orphans every previously-cached key
// for that namespace at once (they simply stop being read - Redis expires
// them on their own TTL, no scan/delete pass needed). This avoids needing
// to enumerate or pattern-match every exact key combination a filterable
// listing endpoint can produce (page/limit/search/sort/etc.), which would
// otherwise mean either a `KEYS`/`SCAN` sweep on every write (expensive,
// and blocking on a busy Redis) or tracking every generated key
// separately.
//
// Every operation here is best-effort: a Redis outage (or simply no
// REDIS_URL configured - see config/redis.js) makes getOrSet() behave
// exactly like caching was never there - it calls fetchFn() and returns
// its result directly, uncached. Nothing in this module ever throws or
// changes response shape because Redis is down; the request still gets
// the same real data, just with a DB read every time instead of some
// fraction of the time.
const redis = require("../config/redis");
const logger = require("../utils/logger").child({ module: "cache" });

// 30-60s TTL band per the Phase RF5 plan - default sits in the middle.
// Configurable because "how stale is tolerable" is a product decision,
// not a code one, and different environments may want to tune it without
// a redeploy of application logic.
const DEFAULT_TTL_SECONDS = (() => {
    const parsed = parseInt(process.env.CACHE_TTL_SECONDS, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 45;
})();

const versionKey = (namespace) => `cache:v:${namespace}`;

// Stable across property order/whitespace differences in whatever object
// a caller passes as the "rest of the key" (typically a parsed query
// object) - two logically-identical queries should hit the same cache
// entry regardless of how their keys happened to be ordered by the
// caller.
const stableStringify = (value) => {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

// Reads the current version for a namespace, defaulting to 1 if unset or
// if Redis can't be reached - a missing/unreadable version just means
// every key built this call falls into "version 1", which is harmless
// (worst case: a cache read from before Redis came back briefly hits a
// stale version 1 entry, which still expires on its own TTL).
const getVersion = async (client, namespace) => {
    try {
        const value = await client.get(versionKey(namespace));
        return value || "1";
    } catch (error) {
        logger.warn({ err: error, namespace }, "cache version read failed, defaulting to v1");
        return "1";
    }
};

const buildKey = (namespace, version, parts) =>
    `${namespace}:v${version}:${stableStringify(parts)}`;

// Wraps a DB fetch with a cache read/write. `parts` is anything
// JSON-serializable that uniquely identifies this call within its
// namespace (e.g. the parsed query object, or a slug) - it does NOT need
// to include the namespace or version itself.
//
// ttlSeconds defaults to DEFAULT_TTL_SECONDS; callers can override per
// call if a given endpoint wants a different point in the 30-60s band.
exports.getOrSet = async (namespace, parts, fetchFn, ttlSeconds = DEFAULT_TTL_SECONDS) => {
    const client = redis.getClient();

    if (!client) {
        return fetchFn();
    }

    const version = await getVersion(client, namespace);
    const key = buildKey(namespace, version, parts);

    try {
        const cached = await client.get(key);
        if (cached !== null) {
            return JSON.parse(cached);
        }
    } catch (error) {
        logger.warn({ err: error, namespace }, "cache read failed, falling back to direct fetch");
    }

    const result = await fetchFn();

    // Fire-and-forget: a failed cache write should never fail the
    // request that already has its real result in hand.
    client
        .set(key, JSON.stringify(result), "EX", ttlSeconds)
        .catch((error) => logger.warn({ err: error, namespace }, "cache write failed"));

    return result;
};

// Bumps a namespace's version, orphaning every key previously cached
// under it. Called from the write paths in category.service.js /
// product.service.js after a mutation that changes what a cached listing
// would show. Best-effort and silent on failure - if this fails, cached
// entries simply live out their existing TTL (at most 60s of staleness)
// rather than the request that triggered the write failing outright.
exports.bumpVersion = async (namespace) => {
    const client = redis.getClient();
    if (!client) {
        return;
    }

    try {
        await client.incr(versionKey(namespace));
    } catch (error) {
        logger.warn({ err: error, namespace }, "cache version bump failed - stale entries will expire via TTL instead");
    }
};
