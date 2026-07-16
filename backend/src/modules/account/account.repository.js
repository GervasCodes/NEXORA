const db = require("../../config/db");

exports.findById = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, role, admin_level,
                account_verification_status, account_verification_rejection_reason,
                account_verification_submitted_at, account_verification_reviewed_at,
                language, theme, currency, is_active, created_at
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
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);
};

// --- Account deletion ---
// Removes genuinely personal/ephemeral data outright, and scrubs
// identifying fields from the user row. We deliberately don't hard-delete
// the users row itself: orders, reviews, notifications, and chat history
// reference it, and hard-deleting would either violate those foreign keys
// or silently destroy other people's order/financial history.
exports.deleteCartItems = async (userId, executor = db) => {
    await executor.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
};

exports.deletePushSubscriptions = async (userId, executor = db) => {
    await executor.query("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
};

exports.scrubSellerProfile = async (userId, executor = db) => {
    await executor.query(
        `UPDATE seller_profiles
        SET store_description = NULL, business_email = NULL, business_phone = NULL,
            address = NULL
        WHERE user_id = ?`,
        [userId]
    );
    await executor.query("UPDATE products SET is_active = FALSE WHERE seller_id = ?", [userId]);
};

exports.anonymizeUser = async (userId, hashedRandomPassword, executor = db) => {
    await executor.query(
        `UPDATE users
        SET first_name = 'Deleted', last_name = 'User',
            email = CONCAT('deleted-user-', id, '@nexora.invalid'),
            phone = CONCAT('deleted-', id),
            password = ?,
            is_active = FALSE
        WHERE id = ?`,
        [hashedRandomPassword, userId]
    );
};
