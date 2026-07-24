const db = require("../../config/db");

// Find Seller by User ID
exports.findByUserId = async (userId) => {

    const [rows] = await db.query(
        `SELECT sp.*, st.name AS store_type_name
        FROM seller_profiles sp
        LEFT JOIN store_types st ON st.id = sp.store_type_id
        WHERE sp.user_id = ?`,
        [userId]
    );

    return rows[0];
};

// Create Seller Profile
exports.create = async (sellerData) => {

    const {
        user_id,
        store_name,
        store_slug,
        store_description,
        store_type_id
    } = sellerData;

    const [result] = await db.query(
        `INSERT INTO seller_profiles
        (user_id, store_name, store_slug, store_description, store_type_id)
        VALUES (?, ?, ?, ?, ?)`,
        [
            user_id,
            store_name,
            store_slug,
            store_description,
            store_type_id || null
        ]
    );

    return result.insertId;
};

// Update Seller Profile
exports.update = async (userId, data) => {

    const fields = [];
    const params = [];

    const allowed = [
        "store_name", "store_description", "business_email",
        "business_phone", "country", "region", "city", "address", "store_type_id",
        "pickup_lat", "pickup_lng", "store_theme",
        "store_tagline", "social_instagram", "social_facebook", "social_whatsapp"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(
        `UPDATE seller_profiles SET ${fields.join(", ")} WHERE user_id = ?`,
        params
    );
};

exports.updateLogo = async (userId, logoUrl) => {
    await db.query(
        "UPDATE seller_profiles SET store_logo = ? WHERE user_id = ?",
        [logoUrl, userId]
    );
};

exports.updateBanner = async (userId, bannerUrl) => {
    await db.query(
        "UPDATE seller_profiles SET store_banner = ? WHERE user_id = ?",
        [bannerUrl, userId]
    );
};
// --- Seller's own delivery agent roster (their hired staff) ---

exports.findAgentByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT id, first_name, last_name, email, role FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
};

exports.findRoster = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sda.id, sda.agent_id, sda.created_at,
                u.first_name, u.last_name, u.email
        FROM seller_delivery_agents sda
        JOIN users u ON u.id = sda.agent_id
        WHERE sda.seller_id = ?
        ORDER BY sda.created_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.isInRoster = async (sellerId, agentId) => {
    const [rows] = await db.query(
        "SELECT id FROM seller_delivery_agents WHERE seller_id = ? AND agent_id = ?",
        [sellerId, agentId]
    );
    return rows.length > 0;
};

exports.addToRoster = async (sellerId, agentId) => {
    const [result] = await db.query(
        "INSERT INTO seller_delivery_agents (seller_id, agent_id) VALUES (?, ?)",
        [sellerId, agentId]
    );
    return result.insertId;
};

exports.removeFromRoster = async (sellerId, agentId) => {
    const [result] = await db.query(
        "DELETE FROM seller_delivery_agents WHERE seller_id = ? AND agent_id = ?",
        [sellerId, agentId]
    );
    return result.affectedRows;
};

// --- Seller collections (Phase 7C) ---
// Same "seller's own roster of something" shape as the delivery-agent
// functions above, applied to product shelves instead of hired agents.

exports.createCollection = async (sellerId, name) => {
    const [[{ nextOrder }]] = await db.query(
        "SELECT COALESCE(MAX(display_order), -1) + 1 AS nextOrder FROM seller_collections WHERE seller_id = ?",
        [sellerId]
    );

    const [result] = await db.query(
        "INSERT INTO seller_collections (seller_id, name, display_order) VALUES (?, ?, ?)",
        [sellerId, name, nextOrder]
    );

    return result.insertId;
};

// A seller's own collections plus how many products sit in each - enough
// for the management list without a second round trip per collection.
exports.findCollections = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sc.id, sc.name, sc.display_order,
            (SELECT COUNT(*) FROM seller_collection_products scp WHERE scp.collection_id = sc.id) AS product_count
        FROM seller_collections sc
        WHERE sc.seller_id = ?
        ORDER BY sc.display_order ASC, sc.id ASC`,
        [sellerId]
    );
    return rows;
};

// Ownership check shared by add/remove-product and delete below - a
// collection only belongs to the seller who created it.
exports.findCollectionById = async (sellerId, collectionId) => {
    const [rows] = await db.query(
        "SELECT id, seller_id, name FROM seller_collections WHERE id = ? AND seller_id = ?",
        [collectionId, sellerId]
    );
    return rows[0];
};

exports.deleteCollection = async (sellerId, collectionId) => {
    const [result] = await db.query(
        "DELETE FROM seller_collections WHERE id = ? AND seller_id = ?",
        [collectionId, sellerId]
    );
    return result.affectedRows;
};

exports.findProductsInCollection = async (collectionId) => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, p.price, p.discount_price, p.stock, p.is_active,
            (
                SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id AND pi.is_primary = 1
                LIMIT 1
            ) AS image_url
        FROM seller_collection_products scp
        JOIN products p ON p.id = scp.product_id
        WHERE scp.collection_id = ?
        ORDER BY scp.display_order ASC, scp.id ASC`,
        [collectionId]
    );
    return rows;
};

exports.isProductInCollection = async (collectionId, productId) => {
    const [rows] = await db.query(
        "SELECT id FROM seller_collection_products WHERE collection_id = ? AND product_id = ?",
        [collectionId, productId]
    );
    return rows.length > 0;
};

exports.addProductToCollection = async (collectionId, productId) => {
    const [[{ nextOrder }]] = await db.query(
        "SELECT COALESCE(MAX(display_order), -1) + 1 AS nextOrder FROM seller_collection_products WHERE collection_id = ?",
        [collectionId]
    );

    await db.query(
        "INSERT INTO seller_collection_products (collection_id, product_id, display_order) VALUES (?, ?, ?)",
        [collectionId, productId, nextOrder]
    );
};

exports.removeProductFromCollection = async (collectionId, productId) => {
    const [result] = await db.query(
        "DELETE FROM seller_collection_products WHERE collection_id = ? AND product_id = ?",
        [collectionId, productId]
    );
    return result.affectedRows;
};

// --- Verification fee / paid badge ---
// (The old document-based verification_status flow was removed in
// migration 029 - account-level verification now lives on `users`,
// see accountVerification module. This fee/badge pair is the separate,
// still-needed concept.)

exports.setVerificationFeePaid = async (userId, amount, reference) => {
    await db.query(
        `UPDATE seller_profiles
        SET verification_fee_amount = ?, verification_fee_paid = TRUE,
            verification_fee_reference = ?, verification_fee_paid_at = NOW()
        WHERE user_id = ?`,
        [amount, reference, userId]
    );
};

// Awards/removes the paid "Verified Seller" badge once both approval and
// fee payment are true (or either becomes false again).
exports.setBadge = async (userId, isVerified) => {
    await db.query(
        "UPDATE seller_profiles SET is_verified = ? WHERE user_id = ?",
        [isVerified, userId]
    );
};

// --- Analytics ---

exports.getOrderTotals = async (sellerId) => {
    const [[row]] = await db.query(
        `SELECT
            COUNT(DISTINCT oi.order_id) AS total_orders,
            COALESCE(SUM(oi.subtotal), 0) AS gross_sales,
            COALESCE(SUM(CASE WHEN oi.wallet_credited THEN oi.commission_amount ELSE 0 END), 0) AS commission_paid,
            COALESCE(SUM(CASE WHEN oi.wallet_credited THEN oi.seller_net_amount ELSE 0 END), 0) AS net_earnings
        FROM order_items oi
        WHERE oi.seller_id = ?`,
        [sellerId]
    );
    return row;
};

exports.getOrderStatusBreakdown = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT o.status, COUNT(DISTINCT o.id) AS count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
        GROUP BY o.status`,
        [sellerId]
    );
    return rows;
};

// Gross sales per day for the last N days - powers a simple sales chart.
exports.getDailySales = async (sellerId, days = 30) => {
    const [rows] = await db.query(
        `SELECT DATE(o.created_at) AS day, COALESCE(SUM(oi.subtotal), 0) AS amount
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.seller_id = ? AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(o.created_at)
        ORDER BY day ASC`,
        [sellerId, days]
    );
    return rows;
};

exports.getTopProducts = async (sellerId, limit = 5) => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug,
                SUM(oi.quantity) AS units_sold,
                SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.seller_id = ?
        GROUP BY p.id, p.name, p.slug
        ORDER BY units_sold DESC
        LIMIT ?`,
        [sellerId, limit]
    );
    return rows;
};

// Buyers who've placed more than one order containing this seller's items.
exports.getRepeatCustomerCount = async (sellerId) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS repeat_customers FROM (
            SELECT o.buyer_id
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.seller_id = ?
            GROUP BY o.buyer_id
            HAVING COUNT(DISTINCT o.id) > 1
        ) t`,
        [sellerId]
    );
    return row.repeat_customers;
};
