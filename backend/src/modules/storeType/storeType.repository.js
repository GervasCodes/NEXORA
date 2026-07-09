const db = require("../../config/db");

exports.findAllActive = async () => {
    const [rows] = await db.query(
        "SELECT * FROM store_types WHERE is_active = 1 ORDER BY name ASC"
    );
    return rows;
};

exports.findAllForAdmin = async () => {
    const [rows] = await db.query("SELECT * FROM store_types ORDER BY name ASC");
    return rows;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM store_types WHERE id = ?", [id]);
    return rows[0];
};

exports.findBySlug = async (slug) => {
    const [rows] = await db.query("SELECT * FROM store_types WHERE slug = ?", [slug]);
    return rows[0];
};

exports.create = async (name, slug) => {
    const [result] = await db.query(
        "INSERT INTO store_types (name, slug) VALUES (?, ?)",
        [name, slug]
    );
    return result.insertId;
};

exports.update = async (id, name, slug) => {
    await db.query(
        "UPDATE store_types SET name = ?, slug = ? WHERE id = ?",
        [name, slug, id]
    );
};

exports.setActive = async (id, isActive) => {
    await db.query("UPDATE store_types SET is_active = ? WHERE id = ?", [isActive, id]);
};
