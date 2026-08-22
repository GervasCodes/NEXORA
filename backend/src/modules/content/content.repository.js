const db = require("../../config/db");

exports.findPublished = async ({ categoryId, limit = 20, offset = 0 } = {}) => {
    const conditions = ["status = 'published'"];
    const params = [];
    if (categoryId) {
        conditions.push("category_id = ?");
        params.push(categoryId);
    }
    params.push(limit, offset);

    const [rows] = await db.query(
        `SELECT id, title, slug, excerpt, cover_image_url, category_id, published_at
        FROM content_articles
        WHERE ${conditions.join(" AND ")}
        ORDER BY published_at DESC
        LIMIT ? OFFSET ?`,
        params
    );
    return rows;
};

exports.findBySlug = async (slug) => {
    const [rows] = await db.query(
        "SELECT * FROM content_articles WHERE slug = ? AND status = 'published'",
        [slug]
    );
    return rows[0];
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM content_articles WHERE id = ?", [id]);
    return rows[0];
};

exports.findSlug = async (slug) => {
    const [rows] = await db.query("SELECT id FROM content_articles WHERE slug = ?", [slug]);
    return rows[0];
};

exports.findAllAdmin = async () => {
    const [rows] = await db.query("SELECT * FROM content_articles ORDER BY updated_at DESC");
    return rows;
};

exports.create = async ({ title, slug, categoryId, bodyMarkdown, excerpt, seoMetaDescription, coverImageUrl, authorId }) => {
    const [result] = await db.query(
        `INSERT INTO content_articles
        (title, slug, category_id, body_markdown, excerpt, seo_meta_description, cover_image_url, author_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [title, slug, categoryId || null, bodyMarkdown, excerpt || null, seoMetaDescription || null, coverImageUrl || null, authorId]
    );
    return result.insertId;
};

exports.update = async (id, fields) => {
    const columns = {
        title: "title", categoryId: "category_id", bodyMarkdown: "body_markdown",
        excerpt: "excerpt", seoMetaDescription: "seo_meta_description", coverImageUrl: "cover_image_url"
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(columns)) {
        if (fields[key] !== undefined) {
            sets.push(`${column} = ?`);
            params.push(fields[key]);
        }
    }
    if (sets.length === 0) return;
    params.push(id);
    await db.query(`UPDATE content_articles SET ${sets.join(", ")} WHERE id = ?`, params);
};

exports.setStatus = async (id, status) => {
    await db.query(
        `UPDATE content_articles SET status = ?, published_at = IF(? = 'published' AND published_at IS NULL, NOW(), published_at) WHERE id = ?`,
        [status, status, id]
    );
};
