const crypto = require("crypto");

const db = require("../../config/db");
const accountRepository = require("./account.repository");
const comparePassword = require("../../utils/comparePassword");
const hashPassword = require("../../utils/hashPassword");

exports.getProfile = async (userId) => {
    const user = await accountRepository.findById(userId);

    if (!user) {
        throw new Error("Account not found");
    }

    return user;
};

exports.updateProfile = async (userId, data) => {
    if (data.email) {
        const existing = await accountRepository.findByEmailExcluding(data.email, userId);
        if (existing) {
            throw new Error("That email is already in use by another account");
        }
    }

    if (data.phone) {
        const existing = await accountRepository.findByPhoneExcluding(data.phone, userId);
        if (existing) {
            throw new Error("That phone number is already in use by another account");
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

exports.changePassword = async (userId, currentPassword, newPassword) => {
    const account = await accountRepository.findAuthById(userId);

    if (!account) {
        throw new Error("Account not found");
    }

    const match = await comparePassword(currentPassword, account.password);
    if (!match) {
        throw new Error("Current password is incorrect");
    }

    const hashed = await hashPassword(newPassword);
    await accountRepository.updatePassword(userId, hashed);
};

// Permanently deletes what can safely be deleted, and scrubs personally
// identifying fields from everything else so the account can never be
// logged into again and no longer carries the person's real name, email,
// or phone number - while preserving the referential integrity of orders,
// reviews, and chat history that other users still rely on.
exports.deleteAccount = async (userId, password) => {
    const account = await accountRepository.findAuthById(userId);

    if (!account) {
        throw new Error("Account not found");
    }

    const match = await comparePassword(password, account.password);
    if (!match) {
        throw new Error("Incorrect password. Account was not deleted.");
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await accountRepository.deleteCartItems(userId, connection);
        await accountRepository.deletePushSubscriptions(userId, connection);
        await accountRepository.scrubSellerProfile(userId, connection);

        const randomPassword = crypto.randomBytes(32).toString("hex");
        const hashedRandomPassword = await hashPassword(randomPassword);
        await accountRepository.anonymizeUser(userId, hashedRandomPassword, connection);

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};
