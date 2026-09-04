const db = require("../../config/db");

// Phase 5 (UI/UX remediation) - wishlist_items now holds both saved
// products and saved services (see migration 096's comment on why this
// is one table with a nullable type-specific column, not two parallel
// tables). Every function below takes { productId, serviceId } with
// exactly one set, mirroring the DB's own CHECK constraint.

exports.add = async (userId, { productId, serviceId }) => {
    await db.query(
        `INSERT IGNORE INTO wishlist_items (user_id, product_id, service_id) VALUES (?, ?, ?)`,
        [userId, productId || null, serviceId || null]
    );
};

exports.remove = async (userId, { productId, serviceId }) => {
    if (productId) {
        await db.query(
            "DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?",
            [userId, productId]
        );
    } else {
        await db.query(
            "DELETE FROM wishlist_items WHERE user_id = ? AND service_id = ?",
            [userId, serviceId]
        );
    }
};

// Both id lists in one round trip - used to light up the heart icon on
// product/service cards without fetching full product/service data for
// every listing.
exports.findIdsByUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT product_id, service_id FROM wishlist_items WHERE user_id = ?",
        [userId]
    );
    return {
        productIds: rows.filter((r) => r.product_id).map((r) => r.product_id),
        serviceIds: rows.filter((r) => r.service_id).map((r) => r.service_id)
    };
};

// Full "Saved items" page, products - same shape as the public product
// listing so the frontend can reuse ProductCard directly.
exports.findProductsByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            p.id, p.name, p.slug, p.price, p.discount_price, p.stock, p.brand,
            sp.store_name, sp.is_verified,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count,
            w.created_at AS saved_at
        FROM wishlist_items w
        JOIN products p ON p.id = w.product_id
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE w.user_id = ? AND w.product_id IS NOT NULL AND p.is_active = 1
        ORDER BY w.created_at DESC`,
        [userId]
    );
    return rows;
};

// Full "Saved items" page, services - same shape ServiceCard.jsx already
// consumes from the public service listing (mirrors
// service.repository.js#findAll's image/rating subqueries exactly -
// ratings join through bookings, there's no direct reviews.service_id).
exports.findServicesByUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            s.id, s.title, s.slug, s.base_price, s.discount_price,
            sp.store_name, sp.is_verified,
            (
                SELECT sm.media_url FROM service_media sm
                WHERE sm.service_id = s.id AND sm.is_primary = 1
                LIMIT 1
            ) AS image_url,
            (
                SELECT AVG(r.rating) FROM reviews r
                JOIN bookings b ON b.id = r.booking_id
                WHERE b.service_id = s.id
            ) AS average_rating,
            (
                SELECT COUNT(*) FROM reviews r
                JOIN bookings b ON b.id = r.booking_id
                WHERE b.service_id = s.id
            ) AS review_count,
            w.created_at AS saved_at
        FROM wishlist_items w
        JOIN services s ON s.id = w.service_id
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        WHERE w.user_id = ? AND w.service_id IS NOT NULL AND s.is_active = 1 AND s.status = 'published'
        ORDER BY w.created_at DESC`,
        [userId]
    );
    return rows;
};
