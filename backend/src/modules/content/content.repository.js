const db = require("../../config/db");

exports.findPublished = async ({ categoryId, search, limit = 20, offset = 0 } = {}) => {
    const conditions = ["a.status = 'published'"];
    const params = [];
    if (categoryId) {
        conditions.push("a.category_id = ?");
        params.push(categoryId);
    }
    // Phase 3 (UI/UX remediation) - plain LIKE, not full-text: guides are
    // a small, editorially-curated set (unlike products/services), so
    // the fulltext-index machinery buildProductSearchPlan wraps around
    // for large catalogs would be overkill here.
    if (search) {
        conditions.push("(a.title LIKE ? OR a.excerpt LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }
    params.push(limit, offset);

    const [rows] = await db.query(
        `SELECT a.id, a.title, a.slug, a.excerpt, a.cover_image_url, a.category_id, a.published_at,
                c.name AS category_name, c.slug AS category_slug
        FROM content_articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY a.published_at DESC
        LIMIT ? OFFSET ?`,
        params
    );
    return rows;
};

// Phase 9 (UI/UX remediation) - the distinct set of categories that
// actually have at least one published guide, for Guides.jsx's filter
// chips - scoped this way (not the full product categories list) so a
// buyer is never shown a filter that would return zero guides.
exports.findCategoriesInUse = async () => {
    const [rows] = await db.query(
        `SELECT DISTINCT c.id, c.name, c.slug
        FROM content_articles a
        JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published'
        ORDER BY c.name ASC`
    );
    return rows;
};

// Related guides (Phase 9, UI/UX remediation) - other published guides
// in the same category, excluding the current one. Falls back to
// "most recent other guides" when the current article has no category
// (category_id is nullable) or is the only one in its category, so
// GuideDetail.jsx's related section is never empty just because of
// categorization, only when there are genuinely no other guides at all.
exports.findRelated = async (articleId, categoryId, limit = 3) => {
    const [sameCategory] = categoryId
        ? await db.query(
            `SELECT id, title, slug, excerpt, cover_image_url
            FROM content_articles
            WHERE status = 'published' AND category_id = ? AND id != ?
            ORDER BY published_at DESC
            LIMIT ?`,
            [categoryId, articleId, limit]
        )
        : [[]];

    if (sameCategory.length >= limit) {
        return sameCategory;
    }

    const [fallback] = await db.query(
        `SELECT id, title, slug, excerpt, cover_image_url
        FROM content_articles
        WHERE status = 'published' AND id != ? AND id NOT IN (?)
        ORDER BY published_at DESC
        LIMIT ?`,
        [articleId, sameCategory.length ? sameCategory.map((a) => a.id) : [0], limit - sameCategory.length]
    );

    return [...sameCategory, ...fallback];
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
