const db = require("../../config/db");
const { buildProductSearchPlan } = require("../../utils/productSearch");
const { buildPriceSellerConditions, buildLocationRatingConditions } = require("../../utils/productFilters");
const { buildOrderByClause } = require("../../utils/productSort");

exports.create = async (data) => {
    const {
        seller_id,
        category_id,
        name,
        slug,
        description,
        price,
        discount_price,
        stock,
        brand,
        product_condition
    } = data;

    const [result] = await db.query(
        `INSERT INTO products 
        (seller_id, category_id, name, slug, description, price, discount_price, stock, brand, product_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            seller_id,
            category_id,
            name,
            slug,
            description,
            price,
            discount_price,
            stock,
            brand,
            product_condition
        ]
    );

    return result.insertId;
};
exports.addProductImage = async (
    productId,
    imageUrl,
    isPrimary,
    displayOrder
) => {

    await db.query(
        `INSERT INTO product_images
        (product_id, image_url, is_primary, display_order)
        VALUES (?, ?, ?, ?)`,
        [
            productId,
            imageUrl,
            isPrimary,
            displayOrder
        ]
    );
};

exports.findById = async (productId) => {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    return rows[0];
};

// Public catalog listing: active products only, with primary image,
// store name, and rating summary. Supports search/category/price
// range/seller filters, plus pagination.
// Search matches product name/brand/description, the category name, AND
// the seller's store name, so typing "phones" surfaces every phone-category
// product across all stores even if the word never appears in an individual
// product's name, and typing a store's name surfaces its whole catalog even
// if that name never appears in any single product's name/brand/description.
//
// minPrice/maxPrice/sellerId (Phase 3A), region/minRating (Phase 3B),
// and sort (Phase 3C) are expected to already be parsed/validated by
// utils/productFilters.js / utils/productSort.js - this function just
// applies whatever it's given. `sp.region` is also now part of the
// SELECT (Phase 4B) so the card can show a seller's location alongside
// rating/badge, not just filter by it.
exports.findAll = async ({ categoryId, search, minPrice, maxPrice, sellerId, region, minRating, sort, page, limit }) => {
    const offset = (page - 1) * limit;
    const conditions = ["p.is_active = 1"];
    const params = [];
    const selectExtra = [];

    if (categoryId) {
        conditions.push("p.category_id = ?");
        params.push(categoryId);
    }

    const priceSeller = buildPriceSellerConditions({ minPrice, maxPrice, sellerId });
    conditions.push(...priceSeller.conditions);
    params.push(...priceSeller.params);

    const locationRating = buildLocationRatingConditions({ region, minRating });
    conditions.push(...locationRating.conditions);
    params.push(...locationRating.params);

    // See utils/productSearch.js for why this is BOOLEAN MODE + prefix
    // wildcards rather than NATURAL LANGUAGE MODE, and why 1-2 char terms
    // still fall back to a plain LIKE scan.
    const searchPlan = buildProductSearchPlan(search);

    if (searchPlan.mode === "fulltext") {
        conditions.push(
            "(MATCH(p.name, p.brand, p.description) AGAINST (? IN BOOLEAN MODE) OR c.name LIKE ? OR sp.store_name LIKE ?)"
        );
        params.push(searchPlan.booleanQuery, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`);
        selectExtra.push("MATCH(p.name, p.brand, p.description) AGAINST (? IN BOOLEAN MODE) AS relevance");
    } else if (searchPlan.mode === "like") {
        conditions.push("(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ? OR c.name LIKE ? OR sp.store_name LIKE ?)");
        params.push(`%${searchPlan.raw}%`, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`, `%${searchPlan.raw}%`);
    }

    // An explicit `sort` (Phase 3C) always wins; with none given, this
    // falls back to relevance-first when a FULLTEXT search is active
    // (selectExtra is only non-empty in that branch), or newest-first
    // otherwise - the same default ordering the listing had before Phase
    // 3C introduced explicit sorting.
    const orderBy = buildOrderByClause(sort, selectExtra.length > 0);

    const whereClause = conditions.join(" AND ");
    // relevance needs its own copy of the boolean-mode query (used once in
    // SELECT, once in WHERE) - only present when the FULLTEXT branch ran.
    const relevanceParam = selectExtra.length ? [searchPlan.booleanQuery] : [];

    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock, p.brand,
            sp.store_name, sp.is_verified, sp.region,
            ${selectExtra.length ? selectExtra.join(", ") + "," : ""}
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
        [...relevanceParam, ...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${whereClause}`,
        params
    );

    return { rows, total };
};

// Distinct sellers with at least one active product, for the "Store"
// filter dropdown (Phase 3A). Optionally scoped to a category, so a
// department page only offers sellers who actually sell in it instead of
// the entire platform's seller list.
exports.findFilterSellers = async ({ categoryId }) => {
    const conditions = ["p.is_active = 1"];
    const params = [];

    if (categoryId) {
        conditions.push("p.category_id = ?");
        params.push(categoryId);
    }

    const [rows] = await db.query(
        `SELECT DISTINCT sp.user_id AS id, sp.store_name
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY sp.store_name ASC`,
        params
    );

    return rows;
};

// Distinct seller regions with at least one active product, for the
// "Location" filter dropdown (Phase 3B). Optionally scoped to a
// category, same reasoning as findFilterSellers above. sp.region is
// free-text (set by the seller in Store settings) and NULL for any
// seller who hasn't set one - those are excluded here since "" isn't a
// meaningful option in a location dropdown.
exports.findFilterRegions = async ({ categoryId }) => {
    const conditions = ["p.is_active = 1", "sp.region IS NOT NULL", "sp.region != ''"];
    const params = [];

    if (categoryId) {
        conditions.push("p.category_id = ?");
        params.push(categoryId);
    }

    const [rows] = await db.query(
        `SELECT DISTINCT sp.region
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY sp.region ASC`,
        params
    );

    return rows.map((row) => row.region);
};

// Public product detail by slug: full info + all images + store + ratings
exports.findBySlug = async (slug) => {
    const [rows] = await db.query(
        `SELECT
            p.*,
            sp.store_name, sp.store_slug, sp.is_verified,
            c.name AS category_name,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.is_active = 1`,
        [slug]
    );

    return rows[0];
};

exports.findImagesByProductId = async (productId) => {
    const [rows] = await db.query(
        `SELECT id, image_url, is_primary, display_order
        FROM product_images
        WHERE product_id = ?
        ORDER BY display_order ASC`,
        [productId]
    );
    return rows;
};

exports.countExistingImages = async (productId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?",
        [productId]
    );
    return rows[0].count;
};

// Seller's own catalog - includes inactive products, unlike the public listing
// Phase 6A - Product Videos. Mirrors addProductImage/findImagesByProductId/
// countExistingImages above, minus is_primary (see migration 044's comment
// for why videos don't have a "cover" concept).
exports.addProductVideo = async (productId, videoUrl, displayOrder) => {
    await db.query(
        `INSERT INTO product_videos
        (product_id, video_url, display_order)
        VALUES (?, ?, ?)`,
        [
            productId,
            videoUrl,
            displayOrder
        ]
    );
};

exports.findVideosByProductId = async (productId) => {
    const [rows] = await db.query(
        `SELECT id, video_url, display_order
        FROM product_videos
        WHERE product_id = ?
        ORDER BY display_order ASC`,
        [productId]
    );
    return rows;
};

exports.countExistingVideos = async (productId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM product_videos WHERE product_id = ?",
        [productId]
    );
    return rows[0].count;
};

// Phase 6B - Product Audio. Same shape as the product_videos functions
// above, and the same reasoning for no is_primary (see migration 045's
// comment).
exports.addProductAudio = async (productId, audioUrl, displayOrder) => {
    await db.query(
        `INSERT INTO product_audio
        (product_id, audio_url, display_order)
        VALUES (?, ?, ?)`,
        [
            productId,
            audioUrl,
            displayOrder
        ]
    );
};

exports.findAudioByProductId = async (productId) => {
    const [rows] = await db.query(
        `SELECT id, audio_url, display_order
        FROM product_audio
        WHERE product_id = ?
        ORDER BY display_order ASC`,
        [productId]
    );
    return rows;
};

exports.countExistingAudio = async (productId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM product_audio WHERE product_id = ?",
        [productId]
    );
    return rows[0].count;
};

exports.findAllBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock,
            p.is_active, p.created_at,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM products p
        WHERE p.seller_id = ?
        ORDER BY p.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Distinct departments (categories) a seller currently has at least one
// active, published product in - used by the Phase 8B Featured Stores
// campaign form (featuredStore module) so a seller can only pay to be
// featured in a department where their store actually has something to
// show, same reasoning sponsorship.service.js#createCampaign uses to
// restrict which of a seller's own products can be sponsored.
exports.findActiveCategoriesBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT c.id, c.name, c.slug
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.seller_id = ? AND p.is_active = 1 AND c.is_active = 1
        ORDER BY c.name ASC`,
        [sellerId]
    );
    return rows;
};

exports.update = async (productId, data) => {
    const fields = [];
    const params = [];

    const allowed = [
        "name", "description", "price", "discount_price",
        "stock", "brand", "product_condition", "category_id"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(productId);

    await db.query(
        `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
        params
    );
};

exports.setActive = async (productId, isActive) => {
    await db.query("UPDATE products SET is_active = ? WHERE id = ?", [isActive, productId]);
};

// Shared setter reused by both the admin manual toggle (admin.repository.js)
// and the seller-paid sponsorship campaign system (sponsorship module,
// Phase 8A) - both ultimately just flip this same display flag added in
// migration 041. Accepts an optional `executor` so sponsorship.service.js
// can flip it inside the same transaction as the wallet debit/campaign
// insert.
exports.setSponsored = async (productId, isSponsored, executor = db) => {
    await executor.query("UPDATE products SET is_sponsored = ? WHERE id = ?", [isSponsored, productId]);
};
