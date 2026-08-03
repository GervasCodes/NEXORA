// Single-instance locking for scheduled jobs (Phase 4 - Engineering &
// Scalability). Once jobs run from a dedicated worker process (see
// jobs/index.js and worker.js) it becomes possible to scale that worker
// horizontally (2+ replicas for redundancy) - without this, every
// replica's own node-cron scheduler would fire the same job at the same
// tick and run it N times concurrently (double escrow releases, double
// booking-lifecycle notifications, etc.).
//
// Uses MySQL's session-level advisory locks (GET_LOCK/RELEASE_LOCK)
// rather than a new dependency (Redis, etc.) - the project already has a
// MySQL pool, and these locks are exactly what they're for: named,
// server-side mutexes that don't require a schema/table. A lock is held
// by the single connection that acquired it, so this checks out a
// dedicated connection from the pool for the lock's lifetime and
// releases it explicitly before returning the connection - GET_LOCK's
// session semantics mean it would otherwise stay held (and block every
// other replica) until that pooled connection happened to be closed.
//
// See docs/SCALABILITY_REPORT.md (Phase 4) for the full design and why
// this approach was chosen over an app-level mutex or a jobs table.
const pool = require("../config/db");
const logger = require("./logger");

// Acquires named lock `lockName`, runs `fn`, then always releases -
// including on error, and even if the process crashes mid-run (MySQL
// auto-releases a session's advisory locks when that session's
// connection closes). `waitSeconds` is how long to block waiting for
// another holder to finish; 0 means "try once, don't wait" - the right
// default for cron ticks, since a job that's still running when the
// next tick fires should be skipped this tick, not queued up behind it.
//
// Returns { acquired: true, result } if `fn` ran, or
// { acquired: false } if the lock was already held elsewhere (by
// another replica, or by this same job still running from a prior
// tick) - callers should treat the latter as a normal, silent skip.
exports.withLock = async (lockName, fn, { waitSeconds = 0 } = {}) => {
    const conn = await pool.getConnection();

    try {
        const [[row]] = await conn.query(
            "SELECT GET_LOCK(?, ?) AS acquired",
            [lockName, waitSeconds]
        );

        // GET_LOCK returns 1 (acquired), 0 (timed out - already held), or
        // NULL (rare internal error, e.g. hit max_execution_time) - only
        // 1 means we actually hold it and should run `fn` and release.
        if (row.acquired !== 1) {
            return { acquired: false };
        }

        try {
            const result = await fn();
            return { acquired: true, result };
        } finally {
            try {
                await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
            } catch (releaseError) {
                // The lock still self-releases when this connection is
                // returned to the pool and eventually recycled/closed -
                // this is a best-effort prompt release, not the only
                // thing standing between here and a stuck lock.
                logger.warn({ err: releaseError, lockName }, "[dbLock] RELEASE_LOCK failed");
            }
        }
    } finally {
        conn.release();
    }
};
