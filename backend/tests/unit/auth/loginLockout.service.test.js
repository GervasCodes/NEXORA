jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});

const db = require("../../../src/config/db");
const userRepository = require("../../../src/modules/auth/auth.repository");
const lockout = require("../../../src/modules/auth/loginLockout.service");

const connection = db.__mockConnection;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-09-22T10:00:00.000Z");

// Feeds computeNextState its own output `times` times, the way repeated
// failures would, each one a second apart.
const failNTimes = (times, start = { failedAttempts: 0, lastFailedAt: null, lockedUntil: null }) => {
    let state = start;
    const history = [];
    for (let i = 0; i < times; i += 1) {
        const at = new Date(NOW.getTime() + i * 1000);
        state = lockout.computeNextState(state, at);
        history.push({ ...state, at });
    }
    return history;
};

describe("loginLockout.service.computeNextState", () => {
    it("does not lock for the first four failures", () => {
        failNTimes(4).forEach((step) => expect(step.lockedUntil).toBeNull());
    });

    it("locks for 5 minutes on the 5th consecutive failure", () => {
        const fifth = failNTimes(5)[4];
        expect(fifth.failedAttempts).toBe(5);
        expect(fifth.lockedUntil.getTime() - fifth.at.getTime()).toBe(5 * MINUTE);
    });

    it("escalates to 15 minutes on the 10th failure and 60 minutes from the 15th on", () => {
        const history = failNTimes(20);
        const lockLength = (n) => history[n - 1].lockedUntil.getTime() - history[n - 1].at.getTime();

        // Failures here are one second apart, so each earlier lock is still
        // running when the next tier trips - the fresh, longer lock wins.
        expect(lockLength(5)).toBe(5 * MINUTE);
        expect(lockLength(10)).toBe(15 * MINUTE);
        expect(lockLength(15)).toBe(60 * MINUTE);
        expect(lockLength(20)).toBe(60 * MINUTE);
    });

    it("counts from scratch when the last failure was more than 24 hours ago", () => {
        const next = lockout.computeNextState(
            { failedAttempts: 4, lastFailedAt: new Date(NOW.getTime() - 25 * HOUR), lockedUntil: null },
            NOW
        );

        expect(next.failedAttempts).toBe(1);
        expect(next.lockedUntil).toBeNull();
    });

    it("keeps counting when the last failure was inside the 24 hour window", () => {
        const next = lockout.computeNextState(
            { failedAttempts: 4, lastFailedAt: new Date(NOW.getTime() - 23 * HOUR), lockedUntil: null },
            NOW
        );

        expect(next.failedAttempts).toBe(5);
        expect(next.lockedUntil).not.toBeNull();
    });

    it("never shortens a lock that is still running (a racing request slipped past the pre-check)", () => {
        const longLock = new Date(NOW.getTime() + 50 * MINUTE);
        const next = lockout.computeNextState(
            { failedAttempts: 9, lastFailedAt: new Date(NOW.getTime() - MINUTE), lockedUntil: longLock },
            NOW
        );

        // 10th failure would set a 15-minute lock; the existing 50-minute one wins.
        expect(next.failedAttempts).toBe(10);
        expect(next.lockedUntil.getTime()).toBe(longLock.getTime());
    });

    it("carries an unexpired lock forward on a non-locking failure, and drops an expired one", () => {
        const stillLocked = lockout.computeNextState(
            { failedAttempts: 5, lastFailedAt: NOW, lockedUntil: new Date(NOW.getTime() + 2 * MINUTE) },
            NOW
        );
        expect(stillLocked.failedAttempts).toBe(6);
        expect(stillLocked.lockedUntil.getTime()).toBe(NOW.getTime() + 2 * MINUTE);

        const expired = lockout.computeNextState(
            { failedAttempts: 5, lastFailedAt: new Date(NOW.getTime() - 10 * MINUTE), lockedUntil: new Date(NOW.getTime() - 5 * MINUTE) },
            NOW
        );
        expect(expired.failedAttempts).toBe(6);
        expect(expired.lockedUntil).toBeNull();
    });

    it("accepts dates as strings or Date objects, as the driver may return either", () => {
        const next = lockout.computeNextState(
            { failedAttempts: "4", lastFailedAt: "2026-09-22T09:59:00.000Z", lockedUntil: null },
            NOW
        );
        expect(next.failedAttempts).toBe(5);
    });
});

describe("loginLockout.service.assertNotLocked / getLockRemainingSeconds", () => {
    it("reports no remaining lock for a user with no lock, a null lock, or an expired lock", () => {
        expect(lockout.getLockRemainingSeconds({}, NOW)).toBe(0);
        expect(lockout.getLockRemainingSeconds({ login_locked_until: null }, NOW)).toBe(0);
        expect(lockout.getLockRemainingSeconds({ login_locked_until: new Date(NOW.getTime() - 1000) }, NOW)).toBe(0);
        expect(() => lockout.assertNotLocked({ login_locked_until: new Date(NOW.getTime() - 1000) }, NOW)).not.toThrow();
    });

    it("rounds the remaining time up to whole seconds", () => {
        expect(lockout.getLockRemainingSeconds({ login_locked_until: new Date(NOW.getTime() + 1500) }, NOW)).toBe(2);
    });

    it("throws a 429 ACCOUNT_LOCKED carrying the wait time for a locked user", () => {
        const user = { login_locked_until: new Date(NOW.getTime() + 90 * 1000) };

        let thrown;
        try {
            lockout.assertNotLocked(user, NOW);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toMatchObject({
            code: "ACCOUNT_LOCKED",
            status: 429,
            retryAfterSeconds: 90,
            params: { minutes: 2 },
            failureReason: "account_locked"
        });
    });

    it("shows at least one minute even when only a few seconds remain", () => {
        const user = { login_locked_until: new Date(NOW.getTime() + 3000) };
        expect(() => lockout.assertNotLocked(user, NOW)).toThrow(expect.objectContaining({ params: { minutes: 1 } }));
    });
});

describe("loginLockout.service.recordFailure", () => {
    const stateRow = (overrides = {}) => ({
        failed_login_attempts: 0,
        last_failed_login_at: null,
        login_locked_until: null,
        ...overrides
    });

    beforeEach(() => {
        connection.beginTransaction.mockResolvedValue(undefined);
        connection.commit.mockResolvedValue(undefined);
        connection.rollback.mockResolvedValue(undefined);
        db.getConnection.mockResolvedValue(connection);
    });

    it("reads the row under a lock, saves the incremented count, and commits", async () => {
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(stateRow({ failed_login_attempts: 1, last_failed_login_at: new Date() }));

        const result = await lockout.recordFailure(42);

        expect(userRepository.findLoginLockStateForUpdate).toHaveBeenCalledWith(42, connection);
        expect(userRepository.saveLoginLockState).toHaveBeenCalledWith(
            42,
            expect.objectContaining({ failedAttempts: 2, lockedUntil: null }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
        expect(result).toEqual({ failedAttempts: 2, locked: false, retryAfterSeconds: 0 });
    });

    it("reports the account as locked, with the wait, on the failure that trips the lock", async () => {
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(stateRow({ failed_login_attempts: 4, last_failed_login_at: new Date() }));

        const result = await lockout.recordFailure(42);

        expect(result.failedAttempts).toBe(5);
        expect(result.locked).toBe(true);
        expect(result.retryAfterSeconds).toBeGreaterThan(4 * 60);
        expect(result.retryAfterSeconds).toBeLessThanOrEqual(5 * 60);
        expect(userRepository.saveLoginLockState).toHaveBeenCalledWith(
            42,
            expect.objectContaining({ failedAttempts: 5, lockedUntil: expect.any(Date) }),
            connection
        );
    });

    it("does nothing (and rolls back) when the user row no longer exists", async () => {
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(undefined);

        const result = await lockout.recordFailure(42);

        expect(userRepository.saveLoginLockState).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
        expect(result.locked).toBe(false);
    });

    it("never throws when the database fails: rolls back, releases the connection, and reports not-locked", async () => {
        userRepository.findLoginLockStateForUpdate.mockRejectedValue(new Error("ER_NO_SUCH_TABLE"));

        const result = await lockout.recordFailure(42);

        expect(result).toEqual({ failedAttempts: null, locked: false, retryAfterSeconds: 0 });
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it("never throws when a connection can't even be obtained", async () => {
        db.getConnection.mockRejectedValue(new Error("pool exhausted"));

        await expect(lockout.recordFailure(42)).resolves.toMatchObject({ locked: false });
    });
});

describe("loginLockout.service.clearFailures", () => {
    it("skips the write entirely when the user has no failures or lock to clear", async () => {
        await lockout.clearFailures({ id: 1, failed_login_attempts: 0, login_locked_until: null });
        await lockout.clearFailures({ id: 1 });
        await lockout.clearFailures(undefined);

        expect(userRepository.clearLoginLockState).not.toHaveBeenCalled();
    });

    it("clears when there are recorded failures", async () => {
        await lockout.clearFailures({ id: 1, failed_login_attempts: 3, login_locked_until: null });
        expect(userRepository.clearLoginLockState).toHaveBeenCalledWith(1);
    });

    it("clears when only a lock timestamp remains", async () => {
        await lockout.clearFailures({ id: 1, failed_login_attempts: 0, login_locked_until: new Date() });
        expect(userRepository.clearLoginLockState).toHaveBeenCalledWith(1);
    });

    it("swallows a failed clear rather than failing the login that triggered it", async () => {
        userRepository.clearLoginLockState.mockRejectedValue(new Error("db down"));

        await expect(lockout.clearFailures({ id: 1, failed_login_attempts: 2 })).resolves.toBeUndefined();
    });
});
