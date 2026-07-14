const db = require("../../config/db");

exports.add = async (userId, productId) => {
    await db.query(
        `INSERT IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)`,
        [userId, productId]
    );
};

exports.remove = async (userId, productId) => {
    await db.query(
        "DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?",
        [userId, productId]
    );
};

// Just the IDs - used to light up the heart icon on product cards
// without fetching full product data for every listing.
exports.findProductIdsByUser = async (userId) => {
    const [rows] = await db.query(
        "SELECT product_id FROM wishlist_items WHERE user_id = ?",
        [userId]
    );
    return rows.map((r) => r.product_id);
};

// Full "Saved items" page - same shape as the public product listing so
// the frontend can reuse ProductCard directly.
exports.findByUser = async (userId) => {
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
        WHERE w.user_id = ? AND p.is_active = 1
        ORDER BY w.created_at DESC`,
        [userId]
    );
    return rows;
};
