// An email with no account must lock exactly like a real one, so the first
// 429 cannot be used to discover which emails are registered.
jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/utils/comparePassword");
jest.mock("../../../src/modules/otp/otp.service");

const userRepository = require("../../../src/modules/auth/auth.repository");
const lockout = require("../../../src/modules/auth/loginLockout.service");
const loginService = require("../../../src/modules/auth/login.service");

const attempt = async (email) => {
    try {
        await loginService.login(email, "whatever-password");
        return "no error";
    } catch (error) {
        return error.code || error.message;
    }
};

describe("lockout for emails that have no account", () => {
    beforeEach(() => {
        lockout._resetUnknownEmailState();
        userRepository.findByEmail.mockResolvedValue(null);
    });

    it("answers INVALID_CREDENTIALS for the first four failures, then locks on the fifth", async () => {
        const results = [];
        for (let i = 0; i < 5; i += 1) results.push(await attempt("nobody@example.com"));
        expect(results.slice(0, 4).every((r) => r === "INVALID_CREDENTIALS")).toBe(true);
        expect(results[4]).toBe("ACCOUNT_LOCKED");
    });

    it("keeps answering ACCOUNT_LOCKED while the lock is active, with a retry time", async () => {
        for (let i = 0; i < 5; i += 1) await attempt("nobody@example.com");
        let error;
        try { await loginService.login("nobody@example.com", "x"); } catch (e) { error = e; }
        expect(error.code).toBe("ACCOUNT_LOCKED");
        expect(error.status || error.statusCode).toBe(429);
        expect(error.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("uses the same 5-minute first lock as a real account", async () => {
        let outcome;
        for (let i = 0; i < 5; i += 1) outcome = lockout.recordUnknownEmailFailure("a@b.com");
        expect(outcome.locked).toBe(true);
        expect(outcome.retryAfterSeconds).toBeGreaterThan(4 * 60);
        expect(outcome.retryAfterSeconds).toBeLessThanOrEqual(5 * 60);
    });

    it("treats the same address in different letter case as one email", async () => {
        for (let i = 0; i < 3; i += 1) await attempt("Nobody@Example.com");
        for (let i = 0; i < 2; i += 1) await attempt("  nobody@example.com ");
        expect(await attempt("NOBODY@EXAMPLE.COM")).toBe("ACCOUNT_LOCKED");
    });

    it("does not lock one email because of failures against another", async () => {
        for (let i = 0; i < 5; i += 1) await attempt("one@example.com");
        expect(await attempt("two@example.com")).toBe("INVALID_CREDENTIALS");
    });

    it("forgets a failure counter after the decay period", () => {
        const start = new Date("2026-01-01T00:00:00Z");
        for (let i = 0; i < 4; i += 1) lockout.recordUnknownEmailFailure("old@example.com", start);
        const next = new Date(start.getTime() + lockout.FAILURE_DECAY_MS + 1000);
        const outcome = lockout.recordUnknownEmailFailure("old@example.com", next);
        expect(outcome.failedAttempts).toBe(1);
        expect(outcome.locked).toBe(false);
    });

    it("stays bounded in memory", () => {
        for (let i = 0; i < 5200; i += 1) lockout.recordUnknownEmailFailure(`user${i}@example.com`);
        // the oldest entries were evicted, so the first email starts counting from 1 again
        expect(lockout.recordUnknownEmailFailure("user0@example.com").failedAttempts).toBe(1);
    });
});
