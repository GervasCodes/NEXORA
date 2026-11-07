const db = require("../../config/db");
const Sentry = require("../../config/sentry");
const userRepository = require("./auth.repository");
const appError = require("../../utils/appError");
const logger = require("../../utils/logger").child({ module: "auth" });

// Per-account lockout with escalating backoff. This is deliberately
// separate from the IP-wide authLimiter (rateLimit.middleware.js): that
// caps requests per source address, so it does nothing against a
// distributed attacker spreading guesses for ONE account across many IPs.
//
// What counts as a failure: a wrong password (login step 1) and a wrong
// login OTP code (step 2). Only a fully completed login (password AND
// OTP) or a successful password reset clears the counter - a correct
// password alone must not reset it, otherwise someone who already knows
// the password could alternate "correct password" with OTP guesses and
// never trip the lock.
//
// Every 5th consecutive failure locks the account, and each lock is
// longer than the last:
//     5 failures  -> 5 minutes
//    10 failures  -> 15 minutes
//    15+ failures -> 60 minutes (every further 5th failure)
// Requests made while locked are rejected without checking the password
// and don't count as further failures, so an attacker can't extend a lock
// forever - but it also means anyone who knows an email can lock that
// account out for a while. That trade-off is what the backoff and the
// password-reset escape hatch (passwordReset.service.js clears the lock)
// are for. A failure counter untouched for 24h starts over.

const ATTEMPTS_PER_LOCK = 5;
const LOCK_MINUTES_BY_TIER = [5, 15, 60];
const FAILURE_DECAY_MS = 24 * 60 * 60 * 1000;

exports.ATTEMPTS_PER_LOCK = ATTEMPTS_PER_LOCK;
exports.LOCK_MINUTES_BY_TIER = LOCK_MINUTES_BY_TIER;
exports.FAILURE_DECAY_MS = FAILURE_DECAY_MS;

const toDate = (value) => (value ? new Date(value) : null);

const lockMinutesForAttempts = (attempts) => {
    const tier = Math.floor(attempts / ATTEMPTS_PER_LOCK);
    return LOCK_MINUTES_BY_TIER[Math.min(tier, LOCK_MINUTES_BY_TIER.length) - 1];
};

// ---- Pure policy ----------------------------------------------------------

// Seconds until `user`'s lock lifts, or 0 if they aren't locked. Works on
// the users row directly (login already loaded it), so checking a lock
// never costs a query.
exports.getLockRemainingSeconds = (user, now = new Date()) => {
    const lockedUntil = toDate(user && user.login_locked_until);
    if (!lockedUntil || lockedUntil <= now) return 0;
    return Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
};

// The state to persist after one more counted failure.
exports.computeNextState = ({ failedAttempts, lastFailedAt, lockedUntil }, now = new Date()) => {
    const last = toDate(lastFailedAt);
    const stale = !last || now.getTime() - last.getTime() > FAILURE_DECAY_MS;
    const attempts = (stale ? 0 : Number(failedAttempts) || 0) + 1;

    // A lock that's still running (only possible if another request raced
    // this one past the pre-check) is never shortened by a newer, shorter one.
    const existing = toDate(lockedUntil);
    let nextLockedUntil = existing && existing > now ? existing : null;

    if (attempts % ATTEMPTS_PER_LOCK === 0) {
        const fresh = new Date(now.getTime() + lockMinutesForAttempts(attempts) * 60 * 1000);
        nextLockedUntil = nextLockedUntil && nextLockedUntil > fresh ? nextLockedUntil : fresh;
    }

    return { failedAttempts: attempts, lastFailedAt: now, lockedUntil: nextLockedUntil };
};

// ---- Errors ---------------------------------------------------------------

// `failureReason` is monitoring-only (see authEvents.js) - it is never
// sent to the client. `params`/`retryAfterSeconds` are read by
// auth.controller.js to fill the translated message and Retry-After header.
const lockedError = (remainingSeconds, failureReason) => Object.assign(appError("ACCOUNT_LOCKED", 429), {
    params: { minutes: Math.max(1, Math.ceil(remainingSeconds / 60)) },
    retryAfterSeconds: remainingSeconds,
    failureReason
});

// Throws ACCOUNT_LOCKED if the account is currently locked. Call it BEFORE
// any password or OTP check so a locked account costs no bcrypt work and
// doesn't count further failures.
exports.assertNotLocked = (user, now = new Date()) => {
    const remaining = exports.getLockRemainingSeconds(user, now);
    if (remaining > 0) {
        throw lockedError(remaining, "account_locked");
    }
};

// ---- Persistence ----------------------------------------------------------

// Counts one failure against the account, in a row-locked transaction so
// concurrent attempts can't lose updates. Returns `{ failedAttempts,
// locked, retryAfterSeconds }`; `locked` is true if the account is locked
// as of this failure.
//
// Never throws: if the lockout write fails, the caller must still answer
// with the ordinary "invalid credentials" response rather than turn a
// bad password into a 500 (or leak a database error to the client). The
// failure is logged and reported to Sentry so a broken lockout is visible
// rather than silent - the IP limiter is still in force meanwhile.
exports.recordFailure = async (userId) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const current = await userRepository.findLoginLockStateForUpdate(userId, connection);
        if (!current) {
            await connection.rollback();
            return { failedAttempts: 0, locked: false, retryAfterSeconds: 0 };
        }

        const now = new Date();
        const next = exports.computeNextState({
            failedAttempts: current.failed_login_attempts,
            lastFailedAt: current.last_failed_login_at,
            lockedUntil: current.login_locked_until
        }, now);

        await userRepository.saveLoginLockState(userId, next, connection);
        await connection.commit();

        const retryAfterSeconds = exports.getLockRemainingSeconds({ login_locked_until: next.lockedUntil }, now);

        if (next.failedAttempts % ATTEMPTS_PER_LOCK === 0) {
            logger.warn({
                event: "auth_account_locked",
                userId,
                failedAttempts: next.failedAttempts,
                retryAfterSeconds
            }, "account locked after repeated failed sign-in attempts");
        }

        return { failedAttempts: next.failedAttempts, locked: retryAfterSeconds > 0, retryAfterSeconds };
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* connection already gone */ }
        }
        logger.error({ err: error, userId }, "failed to record login failure - lockout not applied");
        Sentry.captureException(error, { tags: { area: "login-lockout" } });
        return { failedAttempts: null, locked: false, retryAfterSeconds: 0 };
    } finally {
        if (connection) connection.release();
    }
};

// Resets the counter after a completed login or a password reset. Only
// writes if there is something to clear (the caller already has the users
// row), so an ordinary login with no prior failures costs no extra query.
// Never throws, for the same reason as recordFailure.
exports.clearFailures = async (user) => {
    if (!user || !(Number(user.failed_login_attempts) > 0 || user.login_locked_until)) return;

    try {
        await userRepository.clearLoginLockState(user.id);
    } catch (error) {
        logger.error({ err: error, userId: user.id }, "failed to clear login lockout state");
        Sentry.captureException(error, { tags: { area: "login-lockout" } });
    }
};

// Builds the locked error for a failure that just tripped the lock.
exports.lockedErrorFor = ({ retryAfterSeconds }) => lockedError(retryAfterSeconds, "lock_triggered");
