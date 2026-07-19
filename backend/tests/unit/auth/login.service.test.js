jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/utils/comparePassword");
jest.mock("../../../src/modules/otp/otp.service");

const userRepository = require("../../../src/modules/auth/auth.repository");
const comparePassword = require("../../../src/utils/comparePassword");
const otpService = require("../../../src/modules/otp/otp.service");

const loginService = require("../../../src/modules/auth/login.service");

describe("login.service.login (step 1: password check)", () => {
    it("throws INVALID_CREDENTIALS for an unknown email without revealing which field was wrong", async () => {
        userRepository.findByEmail.mockResolvedValue(null);

        await expect(loginService.login("nobody@example.com", "password123")).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
            status: 401
        });
        expect(comparePassword).not.toHaveBeenCalled();
    });

    it("throws INVALID_CREDENTIALS for a wrong password, same as an unknown email", async () => {
        userRepository.findByEmail.mockResolvedValue({ id: 1, email: "a@b.com", password: "hashed", is_active: 1 });
        comparePassword.mockResolvedValue(false);

        await expect(loginService.login("a@b.com", "wrong")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    });

    it("rejects a deactivated account even with the correct password", async () => {
        userRepository.findByEmail.mockResolvedValue({ id: 1, email: "a@b.com", password: "hashed", is_active: 0 });
        comparePassword.mockResolvedValue(true);

        await expect(loginService.login("a@b.com", "correct")).rejects.toThrow("deactivated");
    });

    it("sends an OTP and returns a masked email + pre-auth token on success, never a session token", async () => {
        userRepository.findByEmail.mockResolvedValue({ id: 1, email: "johndoe@example.com", password: "hashed", is_active: 1 });
        comparePassword.mockResolvedValue(true);
        otpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });

        const result = await loginService.login("johndoe@example.com", "correct");

        expect(otpService.requestOtp).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "login");
        expect(result.maskedEmail).toBe("jo***@example.com");
        expect(result.preAuthToken).toEqual(expect.any(String));
        expect(result.user).toBeUndefined();
    });
});

describe("login.service.verifyLoginOtp (step 2: OTP check -> real session)", () => {
    it("rejects a garbage/expired pre-auth token", async () => {
        await expect(loginService.verifyLoginOtp("not-a-real-jwt", "123456")).rejects.toThrow(
            "sign-in session expired"
        );
    });

    it("issues a real session token and strips the password hash once the OTP is verified", async () => {
        // Build a valid pre-auth token the same way step 1 does, by driving login() through a happy path.
        userRepository.findByEmail.mockResolvedValue({ id: 1, email: "a@b.com", password: "hashed", is_active: 1 });
        comparePassword.mockResolvedValue(true);
        otpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });
        const { preAuthToken: token } = await loginService.login("a@b.com", "correct");

        userRepository.findById.mockResolvedValue({ id: 1, role: "buyer", language: "en", password: "hashed", email: "a@b.com" });
        otpService.verifyOtp.mockResolvedValue(undefined);

        const result = await loginService.verifyLoginOtp(token, "042917");

        expect(otpService.verifyOtp).toHaveBeenCalledWith(1, "login", "042917");
        expect(result.token).toEqual(expect.any(String));
        expect(result.user.password).toBeUndefined();
    });

    it("throws ACCOUNT_NOT_FOUND if the user was deleted between step 1 and step 2", async () => {
        userRepository.findByEmail.mockResolvedValue({ id: 1, email: "a@b.com", password: "hashed", is_active: 1 });
        comparePassword.mockResolvedValue(true);
        otpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });
        const { preAuthToken: token } = await loginService.login("a@b.com", "correct");

        userRepository.findById.mockResolvedValue(null);

        await expect(loginService.verifyLoginOtp(token, "042917")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    });
});
