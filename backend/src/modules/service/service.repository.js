const db = require("../../config/db");
const { buildOrderByClause } = require("../../utils/serviceSort");

exports.create = async (data) => {
    const {
        provider_id,
        category_id,
        title,
        slug,
        description,
        pricing_model,
        base_price,
        discount_price,
        country,
        region,
        city,
        address,
        lat,
        lng
    } = data;

    const [result] = await db.query(
        `INSERT INTO services
        (provider_id, category_id, title, slug, description, pricing_model,
         base_price, discount_price, country, region, city, address, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            provider_id,
            category_id,
            title,
            slug,
            description,
            pricing_model,
            base_price,
            discount_price,
            country,
            region,
            city,
            address,
            lat,
            lng
        ]
    );

    return result.insertId;
};

exports.findById = async (serviceId) => {
    const [rows] = await db.query("SELECT * FROM services WHERE id = ?", [serviceId]);
    return rows[0];
};

// Public marketplace listing: published + active services only, with
// primary media, provider store name, and category name. Mirrors
// product.repository.js#findAll's shape (search/category/price/pagination)
// but without the rating/region filter machinery products grew across
// several later phases - those come later once services have reviews and
// enough listings to make filtering worth it.
exports.findAll = async ({ categoryId, search, minPrice, maxPrice, city, sort, page, limit }) => {
    const offset = (page - 1) * limit;
    const conditions = ["s.is_active = 1", "s.status = 'published'"];
    const params = [];

    if (categoryId) {
        conditions.push("s.category_id = ?");
        params.push(categoryId);
    }

    if (city) {
        conditions.push("s.city = ?");
        params.push(city);
    }

    if (minPrice !== null && minPrice !== undefined) {
        conditions.push("s.base_price >= ?");
        params.push(minPrice);
    }

    if (maxPrice !== null && maxPrice !== undefined) {
        conditions.push("s.base_price <= ?");
        params.push(maxPrice);
    }

    if (search) {
        conditions.push("(s.title LIKE ? OR s.description LIKE ? OR sc.name LIKE ? OR sp.store_name LIKE ?)");
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }

    const whereClause = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT
            s.id, s.title, s.slug, s.pricing_model, s.base_price, s.discount_price,
            s.city, s.region, s.created_at,
            sp.store_name, sp.is_verified,
            sc.name AS category_name, sc.slug AS category_slug,
            (
                SELECT sm.media_url FROM service_media sm
                WHERE sm.service_id = s.id AND sm.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE ${whereClause}
        ORDER BY ${buildOrderByClause(sort)}
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE ${whereClause}`,
        params
    );

    return { rows, total };
};

// Public service detail by slug: full info + provider + category.
exports.findBySlug = async (slug) => {
    const [rows] = await db.query(
        `SELECT
            s.*,
            sp.store_name, sp.store_slug, sp.is_verified,
            sc.name AS category_name, sc.slug AS category_slug
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE s.slug = ? AND s.is_active = 1 AND s.status = 'published'`,
        [slug]
    );

    return rows[0];
};

exports.addMedia = async (serviceId, mediaUrl, mediaType, isPrimary, displayOrder) => {
    await db.query(
        `INSERT INTO service_media
        (service_id, media_url, media_type, is_primary, display_order)
        VALUES (?, ?, ?, ?, ?)`,
        [serviceId, mediaUrl, mediaType, isPrimary, displayOrder]
    );
};

exports.findMediaByServiceId = async (serviceId) => {
    const [rows] = await db.query(
        `SELECT id, media_url, media_type, is_primary, display_order
        FROM service_media
        WHERE service_id = ?
        ORDER BY display_order ASC`,
        [serviceId]
    );
    return rows;
};

exports.countExistingMedia = async (serviceId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM service_media WHERE service_id = ?",
        [serviceId]
    );
    return rows[0].count;
};

// Provider's own listings - includes drafts/suspended, unlike the public
// listing (mirrors product.repository.js#findAllBySeller).
exports.findAllByProvider = async (providerId) => {
    const [rows] = await db.query(
        `SELECT
            s.id, s.title, s.slug, s.pricing_model, s.base_price, s.discount_price,
            s.status, s.is_active, s.created_at,
            (
                SELECT sm.media_url FROM service_media sm
                WHERE sm.service_id = s.id AND sm.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM services s
        WHERE s.provider_id = ?
        ORDER BY s.created_at DESC`,
        [providerId]
    );
    return rows;
};

exports.update = async (serviceId, data) => {
    const fields = [];
    const params = [];

    const allowed = [
        "title", "description", "category_id", "pricing_model",
        "base_price", "discount_price", "country", "region", "city",
        "address", "lat", "lng"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(serviceId);

    await db.query(
        `UPDATE services SET ${fields.join(", ")} WHERE id = ?`,
        params
    );
};

exports.setStatus = async (serviceId, status) => {
    await db.query("UPDATE services SET status = ? WHERE id = ?", [status, serviceId]);
};

exports.setActive = async (serviceId, isActive) => {
    await db.query("UPDATE services SET is_active = ? WHERE id = ?", [isActive, serviceId]);
};
