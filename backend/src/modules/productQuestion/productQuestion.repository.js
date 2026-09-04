const db = require("../../config/db");

// Phase 2 (UI/UX remediation): product Q&A, mirroring reviews'
// seller_reply pattern (see migration 094's comment) rather than a
// threaded discussion model.

exports.findByProduct = async (productId, { page = 1, limit = 10 } = {}) => {
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
        `SELECT
            pq.id, pq.question, pq.seller_answer, pq.seller_answer_at, pq.created_at,
            u.first_name, u.last_name
         FROM product_questions pq
         JOIN users u ON u.id = pq.user_id
         WHERE pq.product_id = ?
         ORDER BY pq.created_at DESC
         LIMIT ? OFFSET ?`,
        [productId, limit, offset]
    );

    const [[{ count }]] = await db.query(
        "SELECT COUNT(*) AS count FROM product_questions WHERE product_id = ?",
        [productId]
    );

    return { questions: rows, total: count, page, limit };
};

exports.findById = async (id) => {
    const [rows] = await db.query(
        "SELECT * FROM product_questions WHERE id = ?",
        [id]
    );
    return rows[0];
};

exports.create = async (productId, userId, question) => {
    const [result] = await db.query(
        "INSERT INTO product_questions (product_id, user_id, question) VALUES (?, ?, ?)",
        [productId, userId, question]
    );
    return result.insertId;
};

exports.setAnswer = async (id, answer) => {
    await db.query(
        "UPDATE product_questions SET seller_answer = ?, seller_answer_at = NOW() WHERE id = ?",
        [answer, id]
    );
};
