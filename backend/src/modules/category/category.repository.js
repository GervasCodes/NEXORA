const db = require("../../config/db");

exports.findAllActive = async () => {
    const [rows] = await db.query(
        "SELECT * FROM categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC"
    );
    return rows;
};

exports.findAllForAdmin = async () => {
    const [rows] = await db.query("SELECT * FROM categories ORDER BY display_order ASC, name ASC");
    return rows;
};

// Product count per department, active listings only. A live COUNT rather
// than a stored column so it can never drift from the products table.
exports.countProductsByCategory = async (categoryId) => {
    const [[{ count }]] = await db.query(
        "SELECT COUNT(*) AS count FROM products WHERE category_id = ? AND is_active = 1",
        [categoryId]
    );
    return count;
};

// Trending preview for a department card: the department's most-reviewed,
// highest-rated active products. Falls back to newest when a category has
// no reviews yet, so new departments still show something. Same field
// shape as product.repository.findAll so these rows render correctly in
// ProductCard wherever they're used (department card preview or the
// department page's trending row).
exports.findTrendingByCategory = async (categoryId, limit) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock,
            sp.store_name, sp.is_verified,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE p.category_id = ? AND p.is_active = 1
        ORDER BY review_count DESC, average_rating DESC, p.created_at DESC
        LIMIT ?`,
        [categoryId, limit]
    );
    return rows;
};

// Recent products for a department - most recently listed active
// products. Feeds the department page's "recently added" row and the
// department card's "new" signal. Same field shape as findAll/above.
exports.findRecentByCategory = async (categoryId, limit) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock, p.created_at,
            sp.store_name, sp.is_verified,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE p.category_id = ? AND p.is_active = 1
        ORDER BY p.created_at DESC
        LIMIT ?`,
        [categoryId, limit]
    );
    return rows;
};

// How many active products were listed in this department within the
// last `days` days - used for the "N new this week" card indicator.
exports.countRecentByCategory = async (categoryId, days) => {
    const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count FROM products
        WHERE category_id = ? AND is_active = 1
        AND created_at >= (NOW() - INTERVAL ? DAY)`,
        [categoryId, days]
    );
    return count;
};

// Promotions row: active products currently on discount, biggest
// percentage-off first. Uses the existing discount_price field - no new
// "promotions" schema needed.
exports.findPromotionsByCategory = async (categoryId, limit) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock,
            sp.store_name, sp.is_verified,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE p.category_id = ? AND p.is_active = 1
            AND p.discount_price IS NOT NULL AND p.discount_price < p.price
        ORDER BY ((p.price - p.discount_price) / p.price) DESC
        LIMIT ?`,
        [categoryId, limit]
    );
    return rows;
};

// Sponsored products row: admin-flagged placements only (see migration
// 041). The campaign/budget/payment system behind this flag is Phase 8A -
// this just renders whatever's currently flagged.
exports.findSponsoredByCategory = async (categoryId, limit) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock,
            sp.store_name, sp.is_verified,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE p.category_id = ? AND p.is_active = 1 AND p.is_sponsored = 1
        ORDER BY p.created_at DESC
        LIMIT ?`,
        [categoryId, limit]
    );
    return rows;
};

// Featured stores: verified sellers with the best average rating among
// their active products in this department. Verified stores are
// prioritized first (trust signal), then rating, then catalog size.
//
// Phase 8B ("Featured Stores") made this placement purchasable
// (store_featured_campaigns, migration 052) without introducing a
// separate "sponsored stores" section or a boolean flag - unlike
// products (Phase 8A's is_sponsored), a store can have active listings
// in more than one department, so "featured" has to be scoped per
// (seller, category). Instead, a currently-active campaign for this
// exact department is LEFT JOINed in live and ranked first
// (`is_featured` DESC), with every other row falling back to the same
// organic ordering as before - so a department with no paid campaigns
// behaves exactly as it did pre-8B, and `is_featured` on the response
// lets FeaturedStoreCard.jsx show a "Featured" badge on paid rows only.
exports.findFeaturedStoresByCategory = async (categoryId, limit) => {
    const [rows] = await db.query(
        `SELECT
            sp.user_id, sp.store_name, sp.store_slug, sp.store_logo, sp.is_verified,
            COUNT(DISTINCT p.id) AS product_count,
            (
                SELECT AVG(r.rating) FROM reviews r
                JOIN products rp ON rp.id = r.product_id
                WHERE rp.seller_id = sp.user_id AND rp.category_id = ?
            ) AS average_rating,
            (sfc.id IS NOT NULL) AS is_featured
        FROM seller_profiles sp
        JOIN products p ON p.seller_id = sp.user_id AND p.category_id = ? AND p.is_active = 1
        LEFT JOIN store_featured_campaigns sfc
            ON sfc.seller_id = sp.user_id AND sfc.category_id = ?
            AND sfc.status = 'active' AND sfc.ends_at > NOW()
        GROUP BY sp.id, sfc.id
        ORDER BY is_featured DESC, sp.is_verified DESC, average_rating DESC, product_count DESC
        LIMIT ?`,
        [categoryId, categoryId, categoryId, limit]
    );
    return rows;
};

// Homepage department grid, with Phase 8C's Department Sponsorship applied.
// Same organic ordering findAllActive always used (display_order ASC, name
// ASC), but any department with a currently-active, unexpired campaign in
// department_sponsorship_campaigns is bumped to the front first.
//
// A department isn't owned by any one seller (several sellers active in
// the same department could each independently sponsor it), so - like
// findFeaturedStoresByCategory (Phase 8B) and unlike products.is_sponsored
// (Phase 8A) - there's no flag on `categories` itself to keep in sync.
// This LEFT JOINs the campaigns table live and derives `is_sponsored` from
// whether *any* matching row exists, so starting/cancelling/expiring a
// campaign never needs a second write anywhere else.
//
// Deliberately a separate function from findAllActive rather than a
// widening of it: findAllActive backs the plain `GET /categories` list
// (category dropdowns on forms elsewhere in the app), where a purchased
// reordering would be a confusing, moving-target UX. Only the homepage
// department grid (category.service.js#listDepartments) should reflect
// paid placement.
exports.findAllActiveWithSponsorship = async () => {
    const [rows] = await db.query(
        `SELECT c.*, (COUNT(dsc.id) > 0) AS is_sponsored
        FROM categories c
        LEFT JOIN department_sponsorship_campaigns dsc
            ON dsc.category_id = c.id
            AND dsc.status = 'active' AND dsc.ends_at > NOW()
        WHERE c.is_active = 1
        GROUP BY c.id
        ORDER BY is_sponsored DESC, c.display_order ASC, c.name ASC`
    );
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

exports.create = async (name, slug, description, displayOrder) => {
    const [result] = await db.query(
        `INSERT INTO categories (name, slug, description, display_order)
        VALUES (?, ?, ?, ?)`,
        [name, slug, description || null, displayOrder || 0]
    );
    return result.insertId;
};

exports.update = async (id, name, slug, description, displayOrder) => {
    await db.query(
        `UPDATE categories
        SET name = ?, slug = ?, description = ?, display_order = ?
        WHERE id = ?`,
        [name, slug, description || null, displayOrder || 0, id]
    );
};

exports.updateCoverImage = async (id, coverImageUrl) => {
    await db.query(
        "UPDATE categories SET cover_image_url = ? WHERE id = ?",
        [coverImageUrl, id]
    );
};

exports.setActive = async (id, isActive) => {
    await db.query("UPDATE categories SET is_active = ? WHERE id = ?", [isActive, id]);
};
