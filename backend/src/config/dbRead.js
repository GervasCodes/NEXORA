// MySQL read-replica pool (Phase 4 - Engineering & Scalability).
//
// This is additive, opt-in infrastructure, not a behavior change: every
// existing `require("../config/db")` call in the codebase is untouched
// and keeps reading/writing the primary exactly as before. This module
// exists so read-heavy, replication-lag-tolerant queries (product/store
// browsing, search, listings, analytics reads - the kind of traffic
// that scales fastest as the catalog/order volume grows) can be pointed
// at a replica later, module by module, without a rewrite: swap
// `const db = require("../config/db")` for
// `const db = require("../config/dbRead")` in a repository's read-only
// query functions and nothing else needs to change, since this exports
// the same pool interface (`.query`, `.getConnection`, etc.).
//
// If DB_READ_HOST isn't set, `pool` here IS the primary pool (same
// object, re-exported) - so requiring this module in an environment
// that hasn't configured a replica yet is a complete no-op, not a
// silent behavior change or a second connection to the same database.
//
// See docs/SCALABILITY_REPORT.md for the rollout plan: which
// repositories are good first candidates, how to reason about
// replication lag for each, and what stays on the primary
// unconditionally (anything read-after-write in the same request, e.g.
// re-reading a row just inserted/updated).
const fs = require("fs");
const mysql = require("mysql2/promise");

const primaryPool = require("./db");

const buildSslConfig = () => {
    if (process.env.DB_READ_SSL_CA_PATH) {
        return { ca: fs.readFileSync(process.env.DB_READ_SSL_CA_PATH).toString() };
    }

    if (process.env.DB_READ_SSL_CA) {
        return { ca: process.env.DB_READ_SSL_CA.replace(/\\n/g, "\n") };
    }

    if (process.env.DB_READ_SSL === "true") {
        return { rejectUnauthorized: process.env.DB_READ_SSL_REJECT_UNAUTHORIZED === "true" };
    }

    // Falls back to the primary's own SSL settings when a read host is
    // configured but its own SSL vars aren't - the common case is that
    // the replica is on the same managed-MySQL provider as the primary
    // and needs the same TLS handling.
    if (process.env.DB_SSL === "true") {
        return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
    }

    return undefined;
};

let pool;

if (process.env.DB_READ_HOST) {
    pool = mysql.createPool({
        host: process.env.DB_READ_HOST,
        port: process.env.DB_READ_PORT || process.env.DB_PORT,
        user: process.env.DB_READ_USER || process.env.DB_USER,
        password: process.env.DB_READ_PASSWORD || process.env.DB_PASSWORD,
        database: process.env.DB_READ_NAME || process.env.DB_NAME,
        ssl: buildSslConfig(),
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_READ_CONNECTION_LIMIT) || 10
    });

    pool.on("error", (error) => {
        console.error("[db read-replica pool error]", error.message);
    });
} else {
    // No replica configured - reuse the primary pool so every caller of
    // this module behaves identically to requiring ../config/db
    // directly until a replica is actually provisioned.
    pool = primaryPool;
}

module.exports = pool;
