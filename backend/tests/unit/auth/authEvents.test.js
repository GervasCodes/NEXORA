jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});

const logger = require("../../../src/utils/logger");
const { logAuthAttempt, reasonFor } = require("../../../src/modules/auth/authEvents");

const req = (overrides = {}) => ({
    ip: "203.0.113.9",
    get: (header) => (header.toLowerCase() === "user-agent" ? "Mozilla/5.0 test" : undefined),
    ...overrides
});

describe("authEvents.logAuthAttempt", () => {
    it("logs a failure at warn level with the shared auth_attempt shape", () => {
        logAuthAttempt(req(), { endpoint: "login", outcome: "failure", reason: "bad_password", userId: 7, email: "Jane@Example.com" });

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.info).not.toHaveBeenCalled();

        const [payload] = logger.warn.mock.calls[0];
        expect(payload).toEqual({
            event: "auth_attempt",
            endpoint: "login",
            outcome: "failure",
            reason: "bad_password",
            userId: 7,
            emailHash: expect.stringMatching(/^[0-9a-f]{12}$/),
            ip: "203.0.113.9",
            userAgent: "Mozilla/5.0 test"
        });
    });

    it("logs a success at info level", () => {
        logAuthAttempt(req(), { endpoint: "login_otp_verify", outcome: "success", userId: 7 });

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("never puts the email address in the log line, but hashes it consistently regardless of case/whitespace", () => {
        logAuthAttempt(req(), { endpoint: "login", outcome: "failure", reason: "x", email: "Jane@Example.com" });
        logAuthAttempt(req(), { endpoint: "login", outcome: "failure", reason: "x", email: "  jane@example.com " });

        const [first] = logger.warn.mock.calls[0];
        const [second] = logger.warn.mock.calls[1];

        expect(JSON.stringify(first).toLowerCase()).not.toContain("jane@example.com");
        expect(first.emailHash).toBe(second.emailHash);
    });

    it("omits the email hash and user id when none are known", () => {
        logAuthAttempt(req(), { endpoint: "login_otp_resend", outcome: "failure", reason: "error" });

        const [payload] = logger.warn.mock.calls[0];
        expect(payload.emailHash).toBeUndefined();
        expect(payload.userId).toBeUndefined();
    });

    it("truncates an oversized user agent", () => {
        logAuthAttempt(req({ get: () => "x".repeat(500) }), { endpoint: "login", outcome: "failure", reason: "x" });

        const [payload] = logger.warn.mock.calls[0];
        expect(payload.userAgent).toHaveLength(120);
    });

    it("never throws, even if the logger itself does", () => {
        logger.warn.mockImplementationOnce(() => { throw new Error("logger broke"); });

        expect(() => logAuthAttempt(req(), { endpoint: "login", outcome: "failure", reason: "x" })).not.toThrow();
    });
});

describe("authEvents.reasonFor", () => {
    it("prefers the monitoring-only failureReason, then the error code", () => {
        expect(reasonFor({ failureReason: "bad_password", code: "INVALID_CREDENTIALS" })).toBe("bad_password");
        expect(reasonFor({ code: "ACCOUNT_SUSPENDED" })).toBe("ACCOUNT_SUSPENDED");
    });

    it("falls back to a generic label rather than the error message, which may carry user-specific detail", () => {
        expect(reasonFor(new Error("Incorrect code. Please try again."))).toBe("error");
        expect(reasonFor(undefined)).toBe("error");
    });
});
