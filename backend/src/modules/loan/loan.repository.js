const db = require("../../config/db");

exports.getSellerVerificationStatus = async (sellerId) => {
    const [rows] = await db.query("SELECT account_verification_status FROM users WHERE id = ?", [sellerId]);
    return rows[0] ? rows[0].account_verification_status : null;
};

exports.findActiveLoan = async (sellerId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM seller_loans WHERE seller_id = ? AND status = 'active' ORDER BY disbursed_at DESC LIMIT 1",
        [sellerId]
    );
    return rows[0];
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM seller_loans WHERE id = ?", [id]);
    return rows[0];
};

exports.findBySeller = async (sellerId) => {
    const [rows] = await db.query(
        "SELECT * FROM seller_loans WHERE seller_id = ? ORDER BY disbursed_at DESC",
        [sellerId]
    );
    return rows;
};

exports.create = async ({ sellerId, principalAmount, feeAmount, totalRepayable }, executor = db) => {
    const [result] = await executor.query(
        `INSERT INTO seller_loans (seller_id, principal_amount, fee_amount, total_repayable, amount_repaid, status)
        VALUES (?, ?, ?, ?, 0, 'active')`,
        [sellerId, principalAmount, feeAmount, totalRepayable]
    );
    return result.insertId;
};

exports.applyRepayment = async (loanId, repaymentAmount, executor = db) => {
    await executor.query(
        `UPDATE seller_loans
        SET amount_repaid = amount_repaid + ?,
            status = CASE WHEN amount_repaid + ? >= total_repayable THEN 'repaid' ELSE status END,
            repaid_at = CASE WHEN amount_repaid + ? >= total_repayable THEN NOW() ELSE repaid_at END
        WHERE id = ?`,
        [repaymentAmount, repaymentAmount, repaymentAmount, loanId]
    );
};
