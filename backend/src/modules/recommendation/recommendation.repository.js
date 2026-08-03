const db = require("../../config/db");

// Shared card-shape SELECT fragment - identical to the columns
// product.repository.js#findAll returns, so the exact same
// ProductCard.jsx component renders these recommendation rows with no
// new frontend prop mapping.
const PRODUCT_CARD_SELECT = `
    SELECT
        p.id, p.name, p.slug, p.price, p.discount_price, p.stock, p.brand,
        sp.store_name, sp.is_verified, sp.region,
        (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS image_url,
        (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS average_rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
    FROM products p
    JOIN seller_profiles sp ON sp.user_id = p.seller_id
`;

// The category_id(s) a buyer actually buys from, most-purchased first -
// the input to "rules-based" category-affinity recommendations. Distinct
// products only (a buyer ordering the same item three times shouldn't
// dominate the ranking three times over) via COUNT(DISTINCT oi.product_id).
exports.findTopCategoriesForBuyer = async (buyerId, limit = 3) => {
    const [rows] = await db.query(
        `SELECT p.category_id, COUNT(DISTINCT oi.product_id) AS product_count
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.buyer_id = ? AND o.payment_status = 'paid' AND p.category_id IS NOT NULL
        GROUP BY p.category_id
        ORDER BY product_count DESC
        LIMIT ?`,
        [buyerId, limit]
    );
    return rows.map((r) => r.category_id);
};

// Product ids a buyer has already purchased - excluded from their own
// recommendations (recommending something already bought isn't useful).
exports.findPurchasedProductIds = async (buyerId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT oi.product_id
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.buyer_id = ? AND o.payment_status = 'paid'`,
        [buyerId]
    );
    return rows.map((r) => r.product_id);
};

// Best sellers within a set of categories, ranked by paid units sold in
// the trailing window - the "popularity" half of the rules-based score.
// excludeProductIds keeps a buyer's own past purchases (and, for the PDP
// "related products" case, the product being viewed) out of the results.
exports.findPopularInCategories = async (categoryIds, excludeProductIds, limit) => {
    if (categoryIds.length === 0) return [];

    const excludeClause = excludeProductIds.length
        ? `AND p.id NOT IN (${excludeProductIds.map(() => "?").join(",")})`
        : "";

    const [rows] = await db.query(
        `${PRODUCT_CARD_SELECT}
        LEFT JOIN (
            SELECT oi.product_id, SUM(oi.quantity) AS units_sold
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.payment_status = 'paid' AND o.created_at >= (NOW() - INTERVAL 60 DAY)
            GROUP BY oi.product_id
        ) sales ON sales.product_id = p.id
        WHERE p.is_active = 1 AND p.category_id IN (${categoryIds.map(() => "?").join(",")})
        ${excludeClause}
        ORDER BY COALESCE(sales.units_sold, 0) DESC, p.created_at DESC
        LIMIT ?`,
        [...categoryIds, ...excludeProductIds, limit]
    );
    return rows;
};

// Platform-wide trending fallback for a buyer with no purchase history
// (or no auth at all) - same trailing-60-day units-sold ranking, just
// not scoped to any category.
exports.findTrending = async (excludeProductIds, limit) => {
    const excludeClause = excludeProductIds.length
        ? `AND p.id NOT IN (${excludeProductIds.map(() => "?").join(",")})`
        : "";

    const [rows] = await db.query(
        `${PRODUCT_CARD_SELECT}
        LEFT JOIN (
            SELECT oi.product_id, SUM(oi.quantity) AS units_sold
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.payment_status = 'paid' AND o.created_at >= (NOW() - INTERVAL 60 DAY)
            GROUP BY oi.product_id
        ) sales ON sales.product_id = p.id
        WHERE p.is_active = 1 ${excludeClause}
        ORDER BY COALESCE(sales.units_sold, 0) DESC, p.created_at DESC
        LIMIT ?`,
        [...excludeProductIds, limit]
    );
    return rows;
};

// Related products for a product detail page: same category, best
// sellers first, excluding the product being viewed itself.
exports.findRelatedToProduct = async (productId, categoryId, limit) => {
    if (!categoryId) return [];

    const [rows] = await db.query(
        `${PRODUCT_CARD_SELECT}
        LEFT JOIN (
            SELECT oi.product_id, SUM(oi.quantity) AS units_sold
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.payment_status = 'paid' AND o.created_at >= (NOW() - INTERVAL 60 DAY)
            GROUP BY oi.product_id
        ) sales ON sales.product_id = p.id
        WHERE p.is_active = 1 AND p.category_id = ? AND p.id != ?
        ORDER BY COALESCE(sales.units_sold, 0) DESC, p.created_at DESC
        LIMIT ?`,
        [categoryId, productId, limit]
    );
    return rows;
};
