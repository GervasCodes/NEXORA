const fs = require("fs");
const mysql = require("mysql2/promise");
require("dotenv").config();
const logger = require("../utils/logger").child({ module: "db-pool" });
const Sentry = require("./sentry");


const buildSslConfig = () => {
    // Full certificate validation, if you have the host's CA cert -
    // strongest option, use this if your provider gives you one.
    if (process.env.DB_SSL_CA_PATH) {
        return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() };
    }

    if (process.env.DB_SSL_CA) {
        return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") };
    }

    // DB_SSL=true with no CA - the common case for most managed MySQL
    // (PlanetScale, Aiven, RDS, DigitalOcean managed DB, etc.), which
    // terminate TLS with a cert you don't have a local CA file for.
    // DB_SSL_REJECT_UNAUTHORIZED=false skips validating that cert chain
    // (still encrypts the connection, just doesn't verify the server's
    // identity) - set to true only once you've set up DB_SSL_CA properly.
    if (process.env.DB_SSL === "true") {
        return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
    }

    return undefined;
};

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: buildSslConfig(),
    waitForConnections: true,
    // Phase RF4 (red-flag remediation): was a hardcoded 10 with no way to
    // tune it without a code change. Default unchanged - this just makes
    // it configurable once real concurrent-usage data says it needs to
    // move. See docs/DEPLOYMENT.md for how to read the saturation
    // warning below when deciding on a new value.
    connectionLimit: parseInt(process.env.DB_POOL_CONNECTION_LIMIT, 10) || 10
});

// Phase RF4: the pool had zero visibility into its own saturation before
// this - a burst of traffic maxing out connectionLimit would just show up
// as slow requests, with nothing pointing at "the DB pool is the
// bottleneck" specifically. mysql2's Pool emits 'enqueue' exactly when a
// query has to wait for a connection instead of getting one immediately -
// the earliest possible saturation signal. Throttled to once per 30s
// (not once per queued query) so a sustained burst produces one alert to
// investigate, not a flood.
//
// pool._allConnections / _freeConnections are mysql2 private internals
// (no public stats API exists as of this mysql2 version) - read
// defensively so a future mysql2 upgrade that changes this shape doesn't
// crash the app, just silently stops reporting the extra numbers.
let lastSaturationWarningAt = 0;
const SATURATION_WARNING_THROTTLE_MS = 30000;

pool.pool.on("enqueue", () => {
    const now = Date.now();
    if (now - lastSaturationWarningAt < SATURATION_WARNING_THROTTLE_MS) {
        return;
    }
    lastSaturationWarningAt = now;

    const stats = {
        connectionLimit: pool.pool.config?.connectionLimit,
        totalConnections: pool.pool._allConnections?.length,
        freeConnections: pool.pool._freeConnections?.length,
        queuedRequests: pool.pool._connectionQueue?.length
    };

    logger.warn(stats, "db pool saturated - a query had to wait for a free connection");
    Sentry.captureMessage("DB connection pool saturated", {
        level: "warning",
        tags: { area: "db-pool" },
        extra: stats
    });
});

// A dropped/reset connection at the pool level (not a query - those
// already throw and get caught by each controller's try/catch) fires
// here instead of becoming an unhandled error that would trip server.js's
// uncaughtException handler and kill the whole process over what's
// usually just a transient network blip. mysql2's pool recovers and
// creates a new connection on the next query automatically either way -
// this only affects whether that recovery is silent+crashy or logged+safe.
pool.on("error", (error) => {
    logger.error({ err: error }, "db pool error");
    Sentry.captureException(error, { tags: { area: "db-pool" } });
});

module.exports = pool;
