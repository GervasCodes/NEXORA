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

// Phase 6C: sortable order-by, shared by findByProduct and findBySeller
// below rather than duplicated inline - "newest" (default) matches every
// prior phase's behavior exactly, "highest"/"lowest" sort on rating with
// created_at as the tiebreaker so same-rating reviews still come out
// newest-first.
const REVIEW_SORT_CLAUSES = {
    newest: "r.created_at DESC",
    highest: "r.rating DESC, r.created_at DESC",
    lowest: "r.rating ASC, r.created_at DESC"
};

const resolveSortClause = (sortBy) => REVIEW_SORT_CLAUSES[sortBy] || REVIEW_SORT_CLAUSES.newest;

exports.findByProduct = async (productId, sortBy) => {
    const [rows] = await db.query(
        `SELECT r.id, r.rating, r.comment, r.seller_reply, r.seller_reply_at, r.created_at,
                u.first_name, u.last_name
        FROM reviews r
        JOIN users u ON u.id = r.buyer_id
        WHERE r.product_id = ?
        ORDER BY ${resolveSortClause(sortBy)}`,
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

// Phase 6C: 1-5 star counts for the rating-distribution bar chart.
// GROUP BY rather than five separate COUNT(...) queries so this stays a
// single round trip regardless of how many distinct ratings exist.
exports.getProductRatingBreakdown = async (productId) => {
    const [rows] = await db.query(
        `SELECT rating, COUNT(*) AS count
        FROM reviews
        WHERE product_id = ?
        GROUP BY rating`,
        [productId]
    );
    return rows;
};

// Phase 5D (store page): every review across every product a seller
// sells, newest first - the store-level equivalent of findByProduct.
// Joins products to scope by seller_id (reviews has no seller_id column
// of its own, same join store.repository.js's average_rating/review_count
// subqueries already use) and carries product_id/name/slug along so the
// store page can link "on <product>" under each review, the one thing a
// single-product listing doesn't need but a multi-product store one does.
exports.findBySeller = async (sellerId, limit, offset, sortBy) => {
    const [rows] = await db.query(
        `SELECT r.id, r.rating, r.comment, r.seller_reply, r.seller_reply_at, r.created_at,
                u.first_name, u.last_name,
                p.id AS product_id, p.name AS product_name, p.slug AS product_slug
        FROM reviews r
        JOIN users u ON u.id = r.buyer_id
        JOIN products p ON p.id = r.product_id
        WHERE p.seller_id = ?
        ORDER BY ${resolveSortClause(sortBy)}
        LIMIT ? OFFSET ?`,
        [sellerId, limit, offset]
    );
    return rows;
};

// Same aggregate store.repository.js's findPublicBySlug already computes
// inline (average_rating/review_count subqueries) - duplicated here as
// its own query rather than imported, since this one needs to run
// independently for pagination's total count and belongs to the review
// module's own tables/joins, not the store module's.
exports.getSellerRatingSummary = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS review_count, AVG(r.rating) AS average_rating
        FROM reviews r
        JOIN products p ON p.id = r.product_id
        WHERE p.seller_id = ?`,
        [sellerId]
    );
    return rows[0];
};

// Phase 6C: store-level sibling of getProductRatingBreakdown, same
// join-through-products reasoning as findBySeller/getSellerRatingSummary
// above.
exports.getSellerRatingBreakdown = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT r.rating, COUNT(*) AS count
        FROM reviews r
        JOIN products p ON p.id = r.product_id
        WHERE p.seller_id = ?
        GROUP BY r.rating`,
        [sellerId]
    );
    return rows;
};

// --- Review photos (Phase 6C) ---
// Direct structural sibling of product_images/videos/audio in
// product.repository.js: countExisting.../add.../findBy...ProductId, just
// against review_photos + review_id instead of a product table.

exports.countExistingPhotos = async (reviewId) => {
    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM review_photos WHERE review_id = ?",
        [reviewId]
    );
    return rows[0].count;
};

exports.addPhoto = async (reviewId, photoUrl, displayOrder) => {
    await db.query(
        `INSERT INTO review_photos (review_id, photo_url, display_order)
        VALUES (?, ?, ?)`,
        [reviewId, photoUrl, displayOrder]
    );
};

// Batch lookup across every review on the current page/product, rather
// than one query per review - same reasoning findByProduct/findBySeller
// already load their reviews in one round trip. Returns flat rows;
// review.service.js groups them by review_id.
exports.findPhotosByReviewIds = async (reviewIds) => {
    if (!reviewIds.length) return [];

    const [rows] = await db.query(
        `SELECT id, review_id, photo_url
        FROM review_photos
        WHERE review_id IN (?)
        ORDER BY display_order ASC`,
        [reviewIds]
    );
    return rows;
};

// --- Seller reply (Phase 6C) ---

exports.setSellerReply = async (reviewId, replyText) => {
    await db.query(
        "UPDATE reviews SET seller_reply = ?, seller_reply_at = NOW() WHERE id = ?",
        [replyText, reviewId]
    );
};
