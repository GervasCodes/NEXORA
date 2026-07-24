const crypto = require("crypto");

const db = require("../../config/db");
const accountRepository = require("./account.repository");
const comparePassword = require("../../utils/comparePassword");
const hashPassword = require("../../utils/hashPassword");
const otpService = require("../otp/otp.service");
const { generateShortLivedToken, verifyShortLivedToken } = require("../../utils/shortLivedToken");
const appError = require("../../utils/appError");

const REAUTH_TYP = "pwd_reauth";
const REAUTH_EXPIRY = "10m";

exports.getProfile = async (userId) => {
    const user = await accountRepository.findById(userId);

    if (!user) {
        throw appError("ACCOUNT_NOT_FOUND", 404);
    }

    return user;
};

exports.updateProfile = async (userId, data) => {
    if (data.email) {
        const existing = await accountRepository.findByEmailExcluding(data.email, userId);
        if (existing) {
            throw appError("EMAIL_IN_USE", 409);
        }
    }

    if (data.phone) {
        const existing = await accountRepository.findByPhoneExcluding(data.phone, userId);
        if (existing) {
            throw appError("PHONE_IN_USE", 409);
        }
    }

    await accountRepository.updateProfile(userId, data);

    return exports.getProfile(userId);
};

// Language / theme / currency - available to every account type.
exports.updateSettings = async (userId, data) => {
    await accountRepository.updateSettings(userId, data);
    return exports.getProfile(userId);
};

// --- OTP-gated password change ---
// Step 1: email a code to the account holder.
exports.requestPasswordChangeOtp = async (userId) => {
    const user = await accountRepository.findById(userId);

    if (!user) {
        throw appError("ACCOUNT_NOT_FOUND", 404);
    }

    return otpService.requestOtp(user, "password_change");
};

// Step 2: verify the code, and hand back a short-lived reauth token. Only
// this token (not the user's current password) unlocks the actual
// password update - this is what lets Settings replace the old
// "type your current password" form with an OTP step instead.
exports.verifyPasswordChangeOtp = async (userId, code) => {
    await otpService.verifyOtp(userId, "password_change", code);
    return generateShortLivedToken(REAUTH_TYP, { id: userId }, REAUTH_EXPIRY);
};

// Step 3: the actual update. Requires the reauth token from step 2 rather
// than the current password.
exports.changePassword = async (userId, reauthToken, newPassword) => {
    let decoded;
    try {
        decoded = verifyShortLivedToken(REAUTH_TYP, reauthToken);
    } catch (error) {
        throw appError("REAUTH_EXPIRED", 401);
    }

    if (decoded.id !== userId) {
        throw appError("REAUTH_EXPIRED", 401);
    }

    const account = await accountRepository.findAuthById(userId);

    if (!account) {
        throw appError("ACCOUNT_NOT_FOUND", 404);
    }

    const hashed = await hashPassword(newPassword);
    await accountRepository.updatePassword(userId, hashed);
};

// Phase 3 - Soft Account Deletion.
// Locks the account out immediately (can never log in or use an
// already-issued session again - see login.service.js and
// auth.middleware.js) and takes down any storefront listings, but
// deliberately stops short of erasing the person's name, email, phone,
// or seller profile. That's Phase 4 (Permanent Account Removal)'s job,
// triggered separately by an admin from the Deleted Accounts section -
// this step only needs to be reversible-in-principle-but-not-in-practice
// (admin.service.js#setUserActive refuses to reactivate a deleted
// account) long enough for that review to happen.
exports.deleteAccount = async (userId, password) => {
    const account = await accountRepository.findAuthById(userId);

    if (!account) {
        throw appError("ACCOUNT_NOT_FOUND", 404);
    }

    const match = await comparePassword(password, account.password);
    if (!match) {
        throw appError("INCORRECT_PASSWORD", 401);
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await accountRepository.deleteCartItems(userId, connection);
        await accountRepository.deletePushSubscriptions(userId, connection);
        await accountRepository.deactivateSellerListings(userId, connection);

        const randomPassword = crypto.randomBytes(32).toString("hex");
        const hashedRandomPassword = await hashPassword(randomPassword);
        await accountRepository.softDeleteUser(userId, hashedRandomPassword, connection);

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};
