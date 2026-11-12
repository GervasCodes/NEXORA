/**
 * Cheap Redis status for the /health endpoint.
 *
 *   "disabled"    Redis is not configured (REDIS_URL unset or REDIS_DISABLED=true); the app runs uncached
 *   "ok"          configured and answered PING quickly
 *   "unavailable" configured but did not answer in time (the app degrades to direct database reads, and
 *                 delivery-offer expiry falls back to non-durable in-process timers)
 *
 * It never throws and never takes longer than `timeoutMs`, so a Redis outage cannot slow the health check
 * that Render's monitor depends on. Redis is optional, so this does NOT change the HTTP status of /health.
 */
const redisConfig = require("../config/redis");

exports.getRedisStatus = async (timeoutMs = 400) => {
    if (!redisConfig.isConfigured()) return "disabled";

    let timer;
    try {
        const client = redisConfig.getClient();
        if (!client) return "disabled";
        const pong = await Promise.race([
            client.ping(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("redis ping timeout")), timeoutMs); })
        ]);
        return pong === "PONG" ? "ok" : "unavailable";
    } catch {
        return "unavailable";
    } finally {
        clearTimeout(timer);
    }
};
