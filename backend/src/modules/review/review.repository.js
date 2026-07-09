const db = require("../../config/db");

// Whether this buyer has a delivered order containing this product
// (i.e. are they actually allowed to review it)
exports.hasDeliveredPurchase = async (buyerId, productId) => {
    const [rows] = await db.query(
        `SELECT o.id
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status = 'delivered'
        LIMIT 1`,
        [buyerId, productId]
    );
    return rows.length > 0;
};

exports.findByBuyerAndProduct = async (buyerId, productId) => {
    const [rows] = await db.query(
        "SELECT * FROM reviews WHERE buyer_id = ? AND product_id = ?",
        [buyerId, productId]
    );
    return rows[0];
};

exports.findById = async (reviewId) => {
    const [rows] = await db.query(
        "SELECT * FROM reviews WHERE id = ?",
        [reviewId]
    );
    return rows[0];
};

exports.create = async (buyerId, productId, rating, comment) => {
    const [result] = await db.query(
        `INSERT INTO reviews (buyer_id, product_id, rating, comment)
        VALUES (?, ?, ?, ?)`,
        [buyerId, productId, rating, comment || null]
    );
    return result.insertId;
};

exports.update = async (reviewId, rating, comment) => {
    await db.query(
        "UPDATE reviews SET rating = ?, comment = ? WHERE id = ?",
        [rating, comment || null, reviewId]
    );
};

exports.remove = async (reviewId) => {
    await db.query("DELETE FROM reviews WHERE id = ?", [reviewId]);
};

exports.findByProduct = async (productId) => {
    const [rows] = await db.query(
        `SELECT r.id, r.rating, r.comment, r.created_at,
                u.first_name, u.last_name
        FROM reviews r
        JOIN users u ON u.id = r.buyer_id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC`,
        [productId]
    );
    return rows;
};

exports.getProductRatingSummary = async (productId) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS review_count, AVG(rating) AS average_rating
        FROM reviews
        WHERE product_id = ?`,
        [productId]
    );
    return rows[0];
};
