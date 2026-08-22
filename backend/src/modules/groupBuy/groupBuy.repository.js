const db = require("../../config/db");

exports.create = async ({ productId, sellerId, groupPrice, minParticipants, deadline }) => {
    const [result] = await db.query(
        `INSERT INTO group_buys (product_id, seller_id, group_price, min_participants, deadline)
        VALUES (?, ?, ?, ?, ?)`,
        [productId, sellerId, groupPrice, minParticipants, deadline]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query(
        `SELECT g.*, p.name AS product_name, p.slug AS product_slug, p.price AS product_price,
                (SELECT COUNT(*) FROM group_buy_participants gp WHERE gp.group_buy_id = g.id) AS participant_count
        FROM group_buys g
        JOIN products p ON p.id = g.product_id
        WHERE g.id = ?`,
        [id]
    );
    return rows[0];
};

exports.findOpen = async ({ productId } = {}) => {
    const conditions = ["g.status = 'open'", "g.deadline > NOW()"];
    const params = [];
    if (productId) {
        conditions.push("g.product_id = ?");
        params.push(productId);
    }

    const [rows] = await db.query(
        `SELECT g.*, p.name AS product_name, p.slug AS product_slug, p.price AS product_price,
                (SELECT COUNT(*) FROM group_buy_participants gp WHERE gp.group_buy_id = g.id) AS participant_count
        FROM group_buys g
        JOIN products p ON p.id = g.product_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY g.deadline ASC`,
        params
    );
    return rows;
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT g.*, p.name AS product_name,
                (SELECT COUNT(*) FROM group_buy_participants gp WHERE gp.group_buy_id = g.id) AS participant_count
        FROM group_buys g
        JOIN products p ON p.id = g.product_id
        WHERE g.seller_id = ?
        ORDER BY g.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Deadline-passed group buys still sitting in 'open' - the expiry sweep
// (groupBuy.service.js#sweepExpired) resolves each of these to
// 'successful' or 'failed' based on whether they hit min_participants.
exports.findExpiredOpen = async () => {
    const [rows] = await db.query(
        "SELECT * FROM group_buys WHERE status = 'open' AND deadline <= NOW()"
    );
    return rows;
};

exports.setStatus = async (id, status) => {
    await db.query("UPDATE group_buys SET status = ? WHERE id = ?", [status, id]);
};

exports.addParticipant = async (groupBuyId, buyerId) => {
    await db.query(
        "INSERT INTO group_buy_participants (group_buy_id, buyer_id) VALUES (?, ?)",
        [groupBuyId, buyerId]
    );
};

exports.findParticipant = async (groupBuyId, buyerId) => {
    const [rows] = await db.query(
        "SELECT * FROM group_buy_participants WHERE group_buy_id = ? AND buyer_id = ?",
        [groupBuyId, buyerId]
    );
    return rows[0];
};

exports.findParticipants = async (groupBuyId) => {
    const [rows] = await db.query(
        `SELECT gp.*, u.first_name, u.email
        FROM group_buy_participants gp
        JOIN users u ON u.id = gp.buyer_id
        WHERE gp.group_buy_id = ?`,
        [groupBuyId]
    );
    return rows;
};

exports.markParticipantOrdered = async (groupBuyId, buyerId, orderId) => {
    await db.query(
        "UPDATE group_buy_participants SET order_id = ? WHERE group_buy_id = ? AND buyer_id = ?",
        [orderId, groupBuyId, buyerId]
    );
};

exports.findMyParticipations = async (buyerId) => {
    const [rows] = await db.query(
        `SELECT gp.*, g.status AS group_buy_status, g.deadline, g.group_price,
                p.name AS product_name, p.slug AS product_slug
        FROM group_buy_participants gp
        JOIN group_buys g ON g.id = gp.group_buy_id
        JOIN products p ON p.id = g.product_id
        WHERE gp.buyer_id = ?
        ORDER BY gp.joined_at DESC`,
        [buyerId]
    );
    return rows;
};
