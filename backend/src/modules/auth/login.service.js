const userRepository = require("./auth.repository");
const comparePassword = require("../../utils/comparePassword");
const generateToken = require("../../utils/generateToken");
const { generateShortLivedToken, verifyShortLivedToken } = require("../../utils/shortLivedToken");
const otpService = require("../otp/otp.service");
const appError = require("../../utils/appError");

const PRE_AUTH_TYP = "login_otp";
const PRE_AUTH_EXPIRY = "10m";

// Step 1: verify email + password. On success, does NOT issue a session -
// it sends an OTP to the account's email and returns a short-lived
// pre-auth token that step 2 needs to complete the login.
exports.login = async (email, password) => {
    const user = await userRepository.findByEmail(email);

    if (!user) {
        throw appError("INVALID_CREDENTIALS", 401);
    }

    const match = await comparePassword(password, user.password);

    if (!match) {
        throw appError("INVALID_CREDENTIALS", 401);
    }

    if (user.is_active === 0) {
        throw new Error("This account has been deactivated. Please contact support");
    }

    await otpService.requestOtp(user, "login");

    const preAuthToken = generateShortLivedToken(PRE_AUTH_TYP, { id: user.id }, PRE_AUTH_EXPIRY);

    // Masked so the frontend can show "we sent a code to j***@example.com"
    // without ever having the full address in a network response.
    const maskedEmail = user.email.replace(/^(.{2}).+(@.+)$/, "$1***$2");

    return { preAuthToken, maskedEmail, expiresInSeconds: 600 };
};

exports.resendLoginOtp = async (preAuthToken) => {
    const { id } = verifyShortLivedToken(PRE_AUTH_TYP, preAuthToken);
    const user = await userRepository.findById(id);

    if (!user) {
        throw new Error("Session expired. Please sign in again.");
    }

    return otpService.requestOtp(user, "login");
};

// Step 2: verify the OTP against the pre-auth token issued in step 1. Only
// now is a real session token issued.
exports.verifyLoginOtp = async (preAuthToken, code) => {
    let decoded;
    try {
        decoded = verifyShortLivedToken(PRE_AUTH_TYP, preAuthToken);
    } catch (error) {
        throw new Error("Your sign-in session expired. Please sign in again.");
    }

    const user = await userRepository.findById(decoded.id);

    if (!user) {
        throw appError("ACCOUNT_NOT_FOUND", 404);
    }

    await otpService.verifyOtp(user.id, "login", code);

    const token = generateToken({
        id: user.id,
        role: user.role,
        admin_level: user.role === "admin" ? user.admin_level : undefined,
        language: user.language
    });

    delete user.password;

    return { user, token };
};
