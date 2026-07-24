const db = require("../../config/db");

// Every function accepts an optional `executor` (a pool or an in-flight
// transaction connection) so wallet.service can run the order-items +
// wallet + ledger writes for a single order atomically.

exports.ensureWallet = async (sellerId, executor = db) => {
    await executor.query(
        "INSERT IGNORE INTO seller_wallets (seller_id, balance, held_balance) VALUES (?, 0, 0)",
        [sellerId]
    );
};

exports.getWallet = async (sellerId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT seller_id, balance, held_balance, updated_at FROM seller_wallets WHERE seller_id = ?",
        [sellerId]
    );
    return rows[0];
};

// Row-locks the wallet (SELECT ... FOR UPDATE) so concurrent credits/debits
// for the same seller can't race each other's balance read.
exports.getWalletForUpdate = async (sellerId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT seller_id, balance, held_balance FROM seller_wallets WHERE seller_id = ? FOR UPDATE",
        [sellerId]
    );
    return rows[0];
};

exports.incrementBalance = async (sellerId, delta, executor = db) => {
    await executor.query(
        "UPDATE seller_wallets SET balance = balance + ? WHERE seller_id = ?",
        [delta, sellerId]
    );
    const wallet = await exports.getWallet(sellerId, executor);
    return wallet.balance;
};

// Escrow (Phase 9C): earnings from orders paid by a platform-captured
// method (mobile money / Snippe / PayPal) land here instead of `balance`
// until Phase 9D's release job (or an admin/dispute action) moves them
// over - see docs/ESCROW_ANALYSIS.md. Mirrors incrementBalance exactly,
// just against the other column.
exports.incrementHeldBalance = async (sellerId, delta, executor = db) => {
    await executor.query(
        "UPDATE seller_wallets SET held_balance = held_balance + ? WHERE seller_id = ?",
        [delta, sellerId]
    );
    const wallet = await exports.getWallet(sellerId, executor);
    return wallet.held_balance;
};

exports.insertTransaction = async (
    { sellerId, type, amount, balanceAfter, referenceType, referenceId, description },
    executor = db
) => {
    await executor.query(
        `INSERT INTO wallet_transactions
        (seller_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sellerId, type, amount, balanceAfter, referenceType, referenceId ?? null, description ?? null]
    );
};

exports.findTransactions = async (sellerId, limit = 50) => {
    const [rows] = await db.query(
        `SELECT id, type, amount, balance_after, reference_type, reference_id, description, created_at
        FROM wallet_transactions
        WHERE seller_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
        [sellerId, limit]
    );
    return rows;
};

// ---- Order items (commission bookkeeping) ---------------------------------

// Line items for this order that haven't been turned into a wallet credit
// yet, grouped implicitly by seller (caller groups in JS).
exports.findUncreditedItemsByOrder = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT id, seller_id, subtotal
        FROM order_items
        WHERE order_id = ? AND wallet_credited = FALSE
        FOR UPDATE`,
        [orderId]
    );
    return rows;
};

// `released`: TRUE for methods with no platform-held money to hold back
// (Cash on Delivery - the seller already has the cash by the time this
// runs; see wallet.service.js#creditSellersForOrder), FALSE for
// platform-captured methods (mobile money / Snippe / PayPal), which
// start out held and wait for Phase 9D's release job.
exports.markItemCredited = async (itemId, commissionRate, commissionAmount, netAmount, released, executor = db) => {
    await executor.query(
        `UPDATE order_items
        SET commission_rate = ?, commission_amount = ?, seller_net_amount = ?,
            wallet_credited = TRUE, wallet_released = ?
        WHERE id = ?`,
        [commissionRate, commissionAmount, netAmount, released, itemId]
    );
};

// ---- Escrow release (Phase 9D) ---------------------------------------------

// The set Phase 9D's background job scans: items whose earnings were
// credited (Phase 9C - into held_balance for anything but Cash on
// Delivery) but not yet released, whose order has actually been
// delivered, and whose delivery happened at least `holdDays` ago. Callers
// still need to apply the dispute-freeze rule themselves (see
// wallet.service.js#releaseEligibleEarnings) - this query only handles
// the timing half of "eligible for release".
exports.findReleasableItems = async (holdDays, executor = db) => {
    const [rows] = await executor.query(
        `SELECT oi.id, oi.order_id, oi.seller_id, oi.seller_net_amount
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN deliveries d ON d.order_id = o.id
        WHERE oi.wallet_credited = TRUE
            AND oi.wallet_released = FALSE
            AND o.status = 'delivered'
            AND d.delivered_at IS NOT NULL
            AND d.delivered_at <= (NOW() - INTERVAL ? DAY)`,
        [Number(holdDays)]
    );
    return rows;
};

// Every not-yet-released, credited item for one order, regardless of
// delivery status or hold-day timing - backs the admin manual
// early-release action (docs/ESCROW_ANALYSIS.md section 3.4), which is
// explicitly meant to bypass the normal timing gate. The dispute-freeze
// rule still applies on top of this - see releaseEligibleEarnings.
exports.findReleasableItemsForOrder = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT id, order_id, seller_id, seller_net_amount
        FROM order_items
        WHERE order_id = ? AND wallet_credited = TRUE AND wallet_released = FALSE`,
        [orderId]
    );
    return rows;
};

// Marks one order_item as released without touching its credited
// amounts. Used both for an actual held -> available money move, and for
// closing out an item whose held earnings were already reversed by a
// dispute refund (dispute.service.js#reverseSellerEarnings) - see the
// "closed by dispute" branch in wallet.service.js#releaseEligibleEarnings.
exports.markItemReleased = async (itemId, executor = db) => {
    await executor.query(
        "UPDATE order_items SET wallet_released = TRUE WHERE id = ?",
        [itemId]
    );
};

// ---- Withdrawal requests ----------------------------------------------------

exports.createWithdrawal = async (sellerId, amount, payoutMethod, payoutDetails, executor = db) => {
    const [result] = await executor.query(
        `INSERT INTO withdrawal_requests (seller_id, amount, payout_method, payout_details)
        VALUES (?, ?, ?, ?)`,
        [sellerId, amount, payoutMethod, payoutDetails]
    );
    return result.insertId;
};

exports.findWithdrawalsBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT id, amount, status, payout_method, payout_details, admin_note, requested_at, processed_at
        FROM withdrawal_requests
        WHERE seller_id = ?
        ORDER BY requested_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.findAllWithdrawals = async () => {
    const [rows] = await db.query(
        `SELECT wr.id, wr.seller_id, wr.amount, wr.status, wr.payout_method, wr.payout_details,
                wr.admin_note, wr.requested_at, wr.processed_at,
                sp.store_name, u.first_name, u.last_name, u.email
        FROM withdrawal_requests wr
        JOIN users u ON u.id = wr.seller_id
        LEFT JOIN seller_profiles sp ON sp.user_id = wr.seller_id
        ORDER BY (wr.status = 'pending') DESC, wr.requested_at DESC`
    );
    return rows;
};

exports.findWithdrawalById = async (id, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM withdrawal_requests WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

exports.updateWithdrawalStatus = async (id, status, adminNote, executor = db) => {
    await executor.query(
        `UPDATE withdrawal_requests
        SET status = ?, admin_note = ?, processed_at = NOW()
        WHERE id = ?`,
        [status, adminNote ?? null, id]
    );
};
