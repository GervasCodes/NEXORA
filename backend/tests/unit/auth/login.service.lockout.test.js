// login.service + the REAL loginLockout.service together, with only the
// database boundary (users repository, pool) and the password/OTP checks
// mocked - this is what proves the wiring: locks are checked before any
// password/OTP work, the right failures are counted, and only a completed
// login clears the counter.
jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/utils/comparePassword");
jest.mock("../../../src/utils/hashPassword");
jest.mock("../../../src/modules/otp/otp.service");
jest.mock("../../../src/modules/account/account.repository");

const db = require("../../../src/config/db");
const userRepository = require("../../../src/modules/auth/auth.repository");
const accountRepository = require("../../../src/modules/account/account.repository");
const comparePassword = require("../../../src/utils/comparePassword");
const hashPassword = require("../../../src/utils/hashPassword");
const otpService = require("../../../src/modules/otp/otp.service");
const { generateShortLivedToken } = require("../../../src/utils/shortLivedToken");

const loginService = require("../../../src/modules/auth/login.service");
const passwordResetService = require("../../../src/modules/auth/passwordReset.service");

const connection = db.__mockConnection;
const MINUTE = 60 * 1000;

const userRow = (overrides = {}) => ({
    id: 1,
    email: "a@b.com",
    password: "hashed",
    role: "buyer",
    language: "en",
    is_active: 1,
    failed_login_attempts: 0,
    last_failed_login_at: null,
    login_locked_until: null,
    ...overrides
});

const lockedFor = (minutes) => new Date(Date.now() + minutes * MINUTE);
const preAuthToken = (id = 1) => generateShortLivedToken("login_otp", { id }, "10m");

const wrongOtp = () => Object.assign(new Error("Incorrect code. Please try again."), { failureReason: "otp_incorrect" });
const expiredOtp = () => Object.assign(new Error("This code has expired. Please request a new one."), { failureReason: "otp_expired" });

// What findLoginLockStateForUpdate returns for `n` prior recent failures.
const priorFailures = (n) => ({
    failed_login_attempts: n,
    last_failed_login_at: new Date(),
    login_locked_until: null
});

beforeEach(() => {
    db.getConnection.mockResolvedValue(connection);
    otpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });
    userRepository.findLoginLockStateForUpdate.mockResolvedValue(priorFailures(0));
});

describe("login step 1 - password", () => {
    it("rejects a locked account before checking the password, even when the password is right", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ login_locked_until: lockedFor(4), failed_login_attempts: 5 }));
        comparePassword.mockResolvedValue(true);

        await expect(loginService.login("a@b.com", "correct")).rejects.toMatchObject({
            code: "ACCOUNT_LOCKED",
            status: 429
        });

        expect(comparePassword).not.toHaveBeenCalled();
        expect(otpService.requestOtp).not.toHaveBeenCalled();
        // Blocked attempts don't count as further failures.
        expect(userRepository.saveLoginLockState).not.toHaveBeenCalled();
    });

    it("lets a user through once their lock has expired", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ login_locked_until: new Date(Date.now() - 1000), failed_login_attempts: 5 }));
        comparePassword.mockResolvedValue(true);

        const result = await loginService.login("a@b.com", "correct");

        expect(result.preAuthToken).toEqual(expect.any(String));
    });

    it("counts a wrong password and still answers with plain INVALID_CREDENTIALS below the threshold", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ failed_login_attempts: 1, last_failed_login_at: new Date() }));
        comparePassword.mockResolvedValue(false);
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(priorFailures(1));

        await expect(loginService.login("a@b.com", "wrong")).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
            status: 401,
            failureReason: "bad_password"
        });

        expect(userRepository.saveLoginLockState).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ failedAttempts: 2, lockedUntil: null }),
            connection
        );
    });

    it("answers the 5th wrong password with ACCOUNT_LOCKED and the wait time", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ failed_login_attempts: 4, last_failed_login_at: new Date() }));
        comparePassword.mockResolvedValue(false);
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(priorFailures(4));

        await expect(loginService.login("a@b.com", "wrong")).rejects.toMatchObject({
            code: "ACCOUNT_LOCKED",
            status: 429,
            failureReason: "lock_triggered",
            retryAfterSeconds: expect.any(Number),
            params: { minutes: 5 }
        });
    });

    it("degrades to plain INVALID_CREDENTIALS, not a 500, if the lockout write fails", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow());
        comparePassword.mockResolvedValue(false);
        userRepository.findLoginLockStateForUpdate.mockRejectedValue(new Error("ER_BAD_FIELD_ERROR"));

        await expect(loginService.login("a@b.com", "wrong")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    });

    it("tags an unknown email for monitoring without changing the client-facing error", async () => {
        userRepository.findByEmail.mockResolvedValue(undefined);

        await expect(loginService.login("nobody@example.com", "x")).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
            failureReason: "unknown_email"
        });
        expect(userRepository.saveLoginLockState).not.toHaveBeenCalled();
    });

    it("does not clear the failure counter on a correct password alone (the OTP step hasn't passed yet)", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ failed_login_attempts: 3, last_failed_login_at: new Date() }));
        comparePassword.mockResolvedValue(true);

        await loginService.login("a@b.com", "correct");

        expect(userRepository.clearLoginLockState).not.toHaveBeenCalled();
    });
});

describe("login step 2 - OTP", () => {
    it("rejects a locked account before touching the OTP", async () => {
        userRepository.findById.mockResolvedValue(userRow({ login_locked_until: lockedFor(10), failed_login_attempts: 10 }));

        await expect(loginService.verifyLoginOtp(preAuthToken(), "123456")).rejects.toMatchObject({ code: "ACCOUNT_LOCKED", status: 429 });

        expect(otpService.verifyOtp).not.toHaveBeenCalled();
    });

    it("counts a wrong OTP code toward the same lockout", async () => {
        userRepository.findById.mockResolvedValue(userRow({ failed_login_attempts: 2, last_failed_login_at: new Date() }));
        otpService.verifyOtp.mockRejectedValue(wrongOtp());
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(priorFailures(2));

        await expect(loginService.verifyLoginOtp(preAuthToken(), "000000")).rejects.toThrow("Incorrect code");

        expect(userRepository.saveLoginLockState).toHaveBeenCalledWith(1, expect.objectContaining({ failedAttempts: 3 }), connection);
    });

    it("locks on the wrong OTP guess that reaches the threshold", async () => {
        userRepository.findById.mockResolvedValue(userRow({ failed_login_attempts: 4, last_failed_login_at: new Date() }));
        otpService.verifyOtp.mockRejectedValue(wrongOtp());
        userRepository.findLoginLockStateForUpdate.mockResolvedValue(priorFailures(4));

        await expect(loginService.verifyLoginOtp(preAuthToken(), "000000")).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    });

    it("does not count an expired code - that's a slow inbox, not an attack", async () => {
        userRepository.findById.mockResolvedValue(userRow());
        otpService.verifyOtp.mockRejectedValue(expiredOtp());

        await expect(loginService.verifyLoginOtp(preAuthToken(), "123456")).rejects.toThrow("expired");

        expect(userRepository.saveLoginLockState).not.toHaveBeenCalled();
    });

    it("clears the counter once password AND OTP have both passed, and strips the lockout columns from the returned user", async () => {
        userRepository.findById.mockResolvedValue(userRow({ failed_login_attempts: 3, last_failed_login_at: new Date() }));
        otpService.verifyOtp.mockResolvedValue(undefined);

        const result = await loginService.verifyLoginOtp(preAuthToken(), "123456");

        expect(userRepository.clearLoginLockState).toHaveBeenCalledWith(1);
        expect(result.token).toEqual(expect.any(String));
        expect(result.user).not.toHaveProperty("password");
        expect(result.user).not.toHaveProperty("failed_login_attempts");
        expect(result.user).not.toHaveProperty("last_failed_login_at");
        expect(result.user).not.toHaveProperty("login_locked_until");
    });

    it("costs an ordinary login (no prior failures) no extra write", async () => {
        userRepository.findById.mockResolvedValue(userRow());
        otpService.verifyOtp.mockResolvedValue(undefined);

        await loginService.verifyLoginOtp(preAuthToken(), "123456");

        expect(userRepository.clearLoginLockState).not.toHaveBeenCalled();
    });
});

describe("login OTP resend", () => {
    it("won't send fresh codes to a locked account", async () => {
        userRepository.findById.mockResolvedValue(userRow({ login_locked_until: lockedFor(5), failed_login_attempts: 5 }));

        await expect(loginService.resendLoginOtp(preAuthToken())).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });

        expect(otpService.requestOtp).not.toHaveBeenCalled();
    });

    it("returns the user id alongside the expiry for the controller's monitoring log", async () => {
        userRepository.findById.mockResolvedValue(userRow());

        await expect(loginService.resendLoginOtp(preAuthToken())).resolves.toEqual({ expiresInSeconds: 300, userId: 1 });
    });
});

describe("password reset as the escape hatch", () => {
    beforeEach(() => {
        hashPassword.mockResolvedValue("new-hash");
        accountRepository.updatePassword.mockResolvedValue(undefined);
        otpService.verifyOtp.mockResolvedValue(undefined);
    });

    it("clears a lockout after a successful reset", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ login_locked_until: lockedFor(30), failed_login_attempts: 10 }));

        await passwordResetService.resetPassword("a@b.com", "123456", "brand-new-password");

        expect(accountRepository.updatePassword).toHaveBeenCalledWith(1, "new-hash");
        expect(userRepository.clearLoginLockState).toHaveBeenCalledWith(1);
    });

    it("leaves the lockout in place when the reset code is wrong", async () => {
        userRepository.findByEmail.mockResolvedValue(userRow({ login_locked_until: lockedFor(30), failed_login_attempts: 10 }));
        otpService.verifyOtp.mockRejectedValue(wrongOtp());

        await expect(passwordResetService.resetPassword("a@b.com", "000000", "brand-new-password")).rejects.toThrow("Incorrect code");

        expect(userRepository.clearLoginLockState).not.toHaveBeenCalled();
    });
});
