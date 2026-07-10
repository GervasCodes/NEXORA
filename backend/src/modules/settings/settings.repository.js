const db = require("../../config/db");

exports.findAll = async () => {
    const [rows] = await db.query(
        "SELECT setting_key, setting_value, updated_at FROM platform_settings"
    );
    return rows;
};

exports.findByKey = async (key) => {
    const [rows] = await db.query(
        "SELECT setting_value FROM platform_settings WHERE setting_key = ?",
        [key]
    );
    return rows[0]?.setting_value;
};

exports.upsert = async (key, value) => {
    await db.query(
        `INSERT INTO platform_settings (setting_key, setting_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
    );
};
