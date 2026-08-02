const db = require("../../config/db");

exports.findAll = async () => {
    const [rows] = await db.query(
        "SELECT * FROM platform_modules ORDER BY name ASC"
    );
    return rows;
};

exports.findByKey = async (moduleKey) => {
    const [rows] = await db.query(
        "SELECT * FROM platform_modules WHERE module_key = ?",
        [moduleKey]
    );
    return rows[0];
};

exports.setActive = async (moduleKey, isActive, message, updatedBy) => {
    await db.query(
        `UPDATE platform_modules
        SET is_active = ?, maintenance_message = ?, updated_by = ?
        WHERE module_key = ?`,
        [isActive, message || null, updatedBy || null, moduleKey]
    );
};
