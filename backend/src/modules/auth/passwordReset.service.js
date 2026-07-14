const userRepository = require("./auth.repository");
const accountRepository = require("../account/account.repository");
const hashPassword = require("../../utils/hashPassword");
const otpService = require("../otp/otp.service");

// Step 1: request a reset code by email. Always responds the same way
// whether or not the email exists - this deliberately does NOT throw for
// an unknown email, so the API response can't be used to enumerate which
// addresses have an account.
exports.requestPasswordReset = async (email) => {
    const user = await userRepository.findByEmail(email);

    if (user) {
        await otpService.requestOtp(user, "password_reset");
    }
};

// Step 2: verify the code and set the new password in one call - unlike
// the logged-in password-change flow, there's no session to issue a
// reauth token against here, so this does both steps at once.
exports.resetPassword = async (email, code, newPassword) => {
    const user = await userRepository.findByEmail(email);

    // Same code path as a real user so a wrong/expired code and an
    // unknown email look identical to the caller - the OTP's own
    // expiry/attempt limits handle abuse regardless.
    if (!user) {
        throw new Error("Incorrect code. Please try again.");
    }

    await otpService.verifyOtp(user.id, "password_reset", code);

    const hashed = await hashPassword(newPassword);
    await accountRepository.updatePassword(user.id, hashed);
};
