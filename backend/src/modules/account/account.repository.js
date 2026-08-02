const db = require("../../config/db");

exports.findById = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, role, admin_level,
                account_verification_status, account_verification_rejection_reason,
                account_verification_submitted_at, account_verification_reviewed_at,
                language, theme, currency, is_active, created_at,
                vehicle_type, vehicle_plate_number
        FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0];
};

exports.findAuthById = async (userId) => {
    const [rows] = await db.query("SELECT id, password FROM users WHERE id = ?", [userId]);
    return rows[0];
};

exports.findByEmailExcluding = async (email, userId) => {
    const [rows] = await db.query(
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [email, userId]
    );
    return rows[0];
};

exports.findByPhoneExcluding = async (phone, userId) => {
    const [rows] = await db.query(
        "SELECT id FROM users WHERE phone = ? AND id != ?",
        [phone, userId]
    );
    return rows[0];
};

exports.updateProfile = async (userId, data) => {
    const fields = [];
    const params = [];

    const allowed = ["first_name", "last_name", "email", "phone"];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
};

exports.updateSettings = async (userId, { language, theme, currency }) => {
    const fields = [];
    const params = [];

    if (language !== undefined) { fields.push("language = ?"); params.push(language); }
    if (theme !== undefined) { fields.push("theme = ?"); params.push(theme); }
    if (currency !== undefined) { fields.push("currency = ?"); params.push(currency); }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
};

exports.updatePassword = async (userId, hashedPassword) => {
    // token_version bump invalidates every session token issued before
    // this password change - see migration 071 and auth.middleware.js.
    await db.query(
        "UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?",
        [hashedPassword, userId]
    );
};

// --- Account deletion (Phase 3 - soft delete) ---
// This is the *soft* delete step: it locks the account and clears out
// genuinely ephemeral/session data, but deliberately leaves the user's
// name, email, phone, and seller profile untouched, so an admin can still
// see who the account belonged to in the Deleted Accounts section before
// deciding to permanently remove it. Scrubbing/erasing that identifying
// data, plus deleting related records, documents, and Cloudinary assets,
// is Phase 4 (Permanent Account Removal)'s job - not this one.
exports.deleteCartItems = async (userId, executor = db) => {
    await executor.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
};

exports.deletePushSubscriptions = async (userId, executor = db) => {
    await executor.query("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
};

// A deleted seller shouldn't keep an active-looking storefront up for
// buyers to browse and buy from while the account can no longer log in
// to manage it - so their listings are taken down the same way an
// admin-moderated listing would be (products.is_active). Harmless no-op
// for buyer/delivery_agent accounts, which have no rows here.
exports.deactivateSellerListings = async (userId, executor = db) => {
    await executor.query("UPDATE products SET is_active = FALSE WHERE seller_id = ?", [userId]);
};

// Marks the account deleted and locks it out (reusing the same is_active
// gate login.service.js/auth.middleware.js already check on every
// login/request), and randomizes the password hash so the old password
// can never be used again even if is_active were ever flipped back by
// mistake. Name/email/phone are intentionally left as-is - see the
// module comment above.
exports.softDeleteUser = async (userId, hashedRandomPassword, executor = db) => {
    await executor.query(
        `UPDATE users
        SET is_active = FALSE, deleted_at = NOW(), password = ?
        WHERE id = ?`,
        [hashedRandomPassword, userId]
    );
};
