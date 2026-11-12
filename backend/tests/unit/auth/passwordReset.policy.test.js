// The reset flow used to accept any new password (the route had no validator
// and the service never checked). It must now reject a weak one BEFORE the
// emailed code is verified, so the code is not consumed by a rejected password.
jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/modules/account/account.repository");
jest.mock("../../../src/modules/otp/otp.service");
jest.mock("../../../src/utils/hashPassword");
jest.mock("../../../src/modules/auth/loginLockout.service");

const userRepository = require("../../../src/modules/auth/auth.repository");
const accountRepository = require("../../../src/modules/account/account.repository");
const otpService = require("../../../src/modules/otp/otp.service");
const hashPassword = require("../../../src/utils/hashPassword");
const service = require("../../../src/modules/auth/passwordReset.service");

describe("passwordReset.resetPassword - password policy", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        userRepository.findByEmail.mockResolvedValue({ id: 7, email: "a@b.com" });
        otpService.verifyOtp.mockResolvedValue(true);
        hashPassword.mockResolvedValue("hashed");
    });

    it.each(["a", "short", "12345678", "password123", "x".repeat(80)])("rejects %p without verifying (consuming) the code", async (pw) => {
        await expect(service.resetPassword("a@b.com", "123456", pw)).rejects.toThrow();
        expect(otpService.verifyOtp).not.toHaveBeenCalled();
        expect(accountRepository.updatePassword).not.toHaveBeenCalled();
    });

    it("rejects a missing password the same way", async () => {
        await expect(service.resetPassword("a@b.com", "123456", undefined)).rejects.toThrow("at least 8");
        expect(otpService.verifyOtp).not.toHaveBeenCalled();
    });

    it("accepts a good password after the code is verified", async () => {
        await service.resetPassword("a@b.com", "123456", "Tz!kj83nD2");
        expect(otpService.verifyOtp).toHaveBeenCalledWith(7, "password_reset", "123456");
        expect(accountRepository.updatePassword).toHaveBeenCalledWith(7, "hashed");
    });

    it("an unknown email still looks like a wrong code for a good password", async () => {
        userRepository.findByEmail.mockResolvedValue(null);
        await expect(service.resetPassword("nobody@x.com", "123456", "Tz!kj83nD2")).rejects.toThrow("Incorrect code");
    });
});
