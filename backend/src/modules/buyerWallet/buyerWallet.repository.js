const db = require("../../config/db");

// Mirrors wallet.repository.js (seller_wallets) exactly, keyed by buyer
// instead of seller. Every function accepts an optional `executor` for
// the same reason - buyerWallet.service runs balance reads/writes and
// the ledger insert for one credit/debit atomically.

exports.ensureWallet = async (buyerId, executor = db) => {
    await executor.query(
        "INSERT IGNORE INTO buyer_wallets (buyer_id, balance) VALUES (?, 0)",
        [buyerId]
    );
};

exports.getWallet = async (buyerId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT buyer_id, balance, updated_at FROM buyer_wallets WHERE buyer_id = ?",
        [buyerId]
    );
    return rows[0];
};

// Row-locks the wallet (SELECT ... FOR UPDATE) so a top-up and a
// checkout debit for the same buyer can't race each other's balance
// read - same reasoning as wallet.repository.js#getWalletForUpdate.
exports.getWalletForUpdate = async (buyerId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT buyer_id, balance FROM buyer_wallets WHERE buyer_id = ? FOR UPDATE",
        [buyerId]
    );
    return rows[0];
};

exports.incrementBalance = async (buyerId, delta, executor = db) => {
    await executor.query(
        "UPDATE buyer_wallets SET balance = balance + ? WHERE buyer_id = ?",
        [delta, buyerId]
    );
    const wallet = await exports.getWallet(buyerId, executor);
    return wallet.balance;
};

exports.insertTransaction = async (
    { buyerId, type, amount, balanceAfter, referenceType, referenceId, description },
    executor = db
) => {
    await executor.query(
        `INSERT INTO buyer_wallet_transactions
        (buyer_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [buyerId, type, amount, balanceAfter, referenceType, referenceId ?? null, description ?? null]
    );
};

exports.findTransactions = async (buyerId, limit = 50) => {
    const [rows] = await db.query(
        "SELECT * FROM buyer_wallet_transactions WHERE buyer_id = ? ORDER BY created_at DESC LIMIT ?",
        [buyerId, limit]
    );
    return rows;
};

// ---- Top-up requests --------------------------------------------------

exports.createTopUp = async (buyerId, amount, executor = db) => {
    const [result] = await executor.query(
        "INSERT INTO wallet_top_ups (buyer_id, amount, status) VALUES (?, ?, 'pending')",
        [buyerId, amount]
    );
    return result.insertId;
};

exports.findTopUpById = async (id) => {
    const [rows] = await db.query("SELECT * FROM wallet_top_ups WHERE id = ?", [id]);
    return rows[0];
};

exports.markTopUpCompleted = async (id) => {
    await db.query("UPDATE wallet_top_ups SET status = 'completed', completed_at = NOW() WHERE id = ?", [id]);
};

exports.markTopUpFailed = async (id) => {
    await db.query("UPDATE wallet_top_ups SET status = 'failed' WHERE id = ?", [id]);
};
