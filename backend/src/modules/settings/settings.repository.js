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

exports.recordHistory = async (key, oldValue, newValue, changedBy) => {
    await db.query(
        `INSERT INTO platform_setting_history (setting_key, old_value, new_value, changed_by)
        VALUES (?, ?, ?, ?)`,
        [key, oldValue, newValue, changedBy]
    );
};

exports.findHistory = async (key, limit = 50) => {
    const [rows] = await db.query(
        `SELECT h.id, h.setting_key, h.old_value, h.new_value, h.changed_at,
                u.first_name, u.last_name, u.email
        FROM platform_setting_history h
        LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.setting_key = ?
        ORDER BY h.changed_at DESC, h.id DESC
        LIMIT ?`,
        [key, Number(limit)]
    );
    return rows;
};

exports.findLastChanges = async () => {
    const [rows] = await db.query(
        `SELECT h.setting_key, h.changed_at, u.first_name, u.last_name
        FROM platform_setting_history h
        JOIN (SELECT setting_key, MAX(id) AS max_id FROM platform_setting_history GROUP BY setting_key) m
            ON m.max_id = h.id
        LEFT JOIN users u ON u.id = h.changed_by`
    );
    return Object.fromEntries(rows.map((r) => [r.setting_key, {
        changed_at: r.changed_at,
        changed_by: [r.first_name, r.last_name].filter(Boolean).join(" ") || null
    }]));
};
