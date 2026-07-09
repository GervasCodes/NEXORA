const db = require("../../config/db");

exports.findAllActive = async () => {
    const [rows] = await db.query(
        "SELECT * FROM categories WHERE is_active = 1 ORDER BY name ASC"
    );
    return rows;
};

exports.findAllForAdmin = async () => {
    const [rows] = await db.query("SELECT * FROM categories ORDER BY name ASC");
    return rows;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM categories WHERE id = ?", [id]);
    return rows[0];
};

exports.findBySlug = async (slug) => {
    const [rows] = await db.query("SELECT * FROM categories WHERE slug = ?", [slug]);
    return rows[0];
};

exports.create = async (name, slug, description) => {
    const [result] = await db.query(
        `INSERT INTO categories (name, slug, description)
        VALUES (?, ?, ?)`,
        [name, slug, description || null]
    );
    return result.insertId;
};

exports.update = async (id, name, slug, description) => {
    await db.query(
        `UPDATE categories
        SET name = ?, slug = ?, description = ?
        WHERE id = ?`,
        [name, slug, description || null, id]
    );
};

exports.setActive = async (id, isActive) => {
    await db.query("UPDATE categories SET is_active = ? WHERE id = ?", [isActive, id]);
};
