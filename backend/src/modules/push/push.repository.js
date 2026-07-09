const db = require("../../config/db");

exports.upsert = async (userId, subscription) => {
    const { endpoint, keys } = subscription;

    await db.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
        [userId, endpoint, keys.p256dh, keys.auth]
    );
};

exports.remove = async (userId, endpoint) => {
    await db.query(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
        [userId, endpoint]
    );
};

exports.findByUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT * FROM push_subscriptions WHERE user_id = ?",
        [userId]
    );
    return rows;
};

// A push send can come back 404/410 if the browser has invalidated the
// subscription (uninstalled, permission revoked, etc.) — clean those up.
exports.removeById = async (id) => {
    await db.query("DELETE FROM push_subscriptions WHERE id = ?", [id]);
};
