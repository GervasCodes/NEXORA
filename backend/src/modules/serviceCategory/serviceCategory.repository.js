const db = require("../../config/db");

exports.findAllActive = async () => {
    const [rows] = await db.query(
        "SELECT * FROM service_categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC"
    );
    return rows;
};

exports.findAllForAdmin = async () => {
    const [rows] = await db.query(
        "SELECT * FROM service_categories ORDER BY display_order ASC, name ASC"
    );
    return rows;
};

// Published-listing count per category, active listings only. A live
// COUNT rather than a stored column, same reasoning as
// category.repository.js#countProductsByCategory - it can never drift
// from the services table.
exports.countServicesByCategory = async (categoryId) => {
    const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count FROM services
        WHERE category_id = ? AND is_active = 1 AND status = 'published'`,
        [categoryId]
    );
    return count;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM service_categories WHERE id = ?", [id]);
    return rows[0];
};

exports.findBySlug = async (slug) => {
    const [rows] = await db.query("SELECT * FROM service_categories WHERE slug = ?", [slug]);
    return rows[0];
};

exports.create = async (name, slug, description, displayOrder) => {
    const [result] = await db.query(
        `INSERT INTO service_categories (name, slug, description, display_order)
        VALUES (?, ?, ?, ?)`,
        [name, slug, description || null, displayOrder || 0]
    );
    return result.insertId;
};

exports.update = async (id, name, slug, description, displayOrder) => {
    await db.query(
        `UPDATE service_categories
        SET name = ?, slug = ?, description = ?, display_order = ?
        WHERE id = ?`,
        [name, slug, description || null, displayOrder || 0, id]
    );
};

exports.updateCoverImage = async (id, coverImageUrl) => {
    await db.query(
        "UPDATE service_categories SET cover_image_url = ? WHERE id = ?",
        [coverImageUrl, id]
    );
};

exports.setActive = async (id, isActive, maintenanceMessage) => {
    await db.query(
        "UPDATE service_categories SET is_active = ?, maintenance_message = ? WHERE id = ?",
        [isActive, isActive ? null : (maintenanceMessage || null), id]
    );
};
