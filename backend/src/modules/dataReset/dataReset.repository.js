const db = require("../../config/db");

// Ids are fed into `IN (?)` lists. A full-platform reset on a mature
// database could resolve hundreds of thousands of order ids, and MySQL's
// max_allowed_packet (not to mention the optimizer) does badly with a
// single IN list that size - so every id-driven statement runs in fixed
// batches instead of one giant statement. 1000 is the same batch size
// order.repository.js uses for its bulk lookups.
const CHUNK_SIZE = 1000;

const chunk = (ids) => {
    const out = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) out.push(ids.slice(i, i + CHUNK_SIZE));
    return out;
};

// Runs `sql` once per batch of ids and returns the total affectedRows.
// `sql` must contain exactly one `IN (?)` placeholder for the id batch;
// anything else it needs goes in `leadingParams` (bound before the list).
const runInChunks = async (connection, sql, ids, leadingParams = []) => {
    if (!ids.length) return 0;

    let affected = 0;
    for (const batch of chunk(ids)) {
        const [result] = await connection.query(sql, [...leadingParams, batch]);
        affected += result.affectedRows || 0;
    }
    return affected;
};

// ---- Scope resolution -----------------------------------------------------
// Everything below answers one question: which order ids are in scope for
// this reset? Resolved into a plain JS array up front rather than used as a
// subquery, for two reasons: MySQL can't DELETE FROM a table it's also
// SELECTing from in a subquery (which `DELETE FROM orders WHERE id IN
// (SELECT ... FROM orders ...)` would be), and having the concrete list
// makes the preview counts and the executed deletes provably identical.

// A seller's orders are the orders that contain at least one of their line
// items. In a multi-vendor cart, checkout splits into one child order per
// vendor (migration 031), so in practice this is that seller's child orders
// - but it's derived from order_items rather than assuming the split, so a
// pre-031 single order containing this seller's items is still caught.
exports.findSellerOrderIds = async (sellerId, { testOnly }) => {
    const [rows] = await db.query(
        `SELECT DISTINCT o.id
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
        ${testOnly ? "AND o.is_test = TRUE" : ""}`,
        [sellerId]
    );
    return rows.map((r) => r.id);
};

exports.findAllOrderIds = async ({ testOnly }) => {
    const [rows] = await db.query(
        `SELECT id FROM orders ${testOnly ? "WHERE is_test = TRUE" : ""}`
    );
    return rows.map((r) => r.id);
};

// Parent orders (migration 031) hold no line items of their own, so they
// never come back from findSellerOrderIds - they have to be picked up from
// their children. Critically, a parent is only in scope once EVERY one of
// its children is: a cart split between this seller and another seller
// produces a parent whose other child must survive, and deleting the
// shared parent would cascade that other seller's order away too. Called
// after the child deletes, so "has no children left" is the real state.
exports.findOrphanedParentOrderIds = async (connection, parentIds) => {
    if (!parentIds.length) return [];

    const found = [];
    for (const batch of chunk(parentIds)) {
        const [rows] = await connection.query(
            `SELECT p.id
            FROM orders p
            WHERE p.id IN (?)
              AND p.is_parent = TRUE
              AND NOT EXISTS (SELECT 1 FROM orders c WHERE c.parent_order_id = p.id)`,
            [batch]
        );
        found.push(...rows.map((r) => r.id));
    }
    return found;
};

exports.findParentIdsOf = async (orderIds) => {
    if (!orderIds.length) return [];

    const found = new Set();
    for (const batch of chunk(orderIds)) {
        const [rows] = await db.query(
            `SELECT DISTINCT parent_order_id FROM orders
            WHERE id IN (?) AND parent_order_id IS NOT NULL`,
            [batch]
        );
        rows.forEach((r) => found.add(r.parent_order_id));
    }
    return [...found];
};

// ---- Preview counts -------------------------------------------------------
// The numbers shown on the confirmation screen. Deliberately counts the
// same root tables the deletes below target, so "what the preview said"
// and "what got deleted" line up. Child rows reached via ON DELETE CASCADE
// aren't counted individually - there's no useful decision an admin makes
// off "and 4,812 order_items".

const countScoped = async (table, where, params) => {
    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM ${table} ${where}`,
        params
    );
    return total;
};

exports.countSellerScope = async (sellerId, { testOnly, orderIds }) => {
    const testClause = (col = "is_test") => (testOnly ? ` AND ${col} = TRUE` : "");

    return {
        orders: orderIds.length,
        reviews: await countScoped(
            "reviews r",
            `WHERE r.product_id IN (SELECT id FROM products WHERE seller_id = ?)${testOnly ? " AND r.is_test = TRUE" : ""}`,
            [sellerId]
        ),
        conversations: await countScoped(
            "conversations",
            `WHERE seller_id = ?${testClause()}`,
            [sellerId]
        ),
        disputes: await countScoped("disputes", `WHERE seller_id = ?${testClause()}`, [sellerId]),
        returns: await countScoped("order_returns", `WHERE seller_id = ?${testClause()}`, [sellerId]),
        wallet_transactions: await countScoped(
            "wallet_transactions",
            `WHERE seller_id = ?${testClause()}`,
            [sellerId]
        ),
        withdrawal_requests: await countScoped(
            "withdrawal_requests",
            "WHERE seller_id = ?",
            [sellerId]
        )
    };
};

exports.countPlatformScope = async ({ testOnly, orderIds }) => {
    const where = testOnly ? "WHERE is_test = TRUE" : "";

    return {
        orders: orderIds.length,
        reviews: await countScoped("reviews", where, []),
        conversations: await countScoped("conversations", where, []),
        disputes: await countScoped("disputes", where, []),
        returns: await countScoped("order_returns", where, []),
        wallet_transactions: await countScoped("wallet_transactions", where, []),
        buyer_wallet_transactions: await countScoped("buyer_wallet_transactions", where, []),
        withdrawal_requests: await countScoped("withdrawal_requests", "", [])
    };
};

// ---- Order tree deletion --------------------------------------------------
// Order of operations matters and is not arbitrary. Most things hanging off
// an order are ON DELETE CASCADE and would go on their own, but six FKs
// pointing at orders/payments have NO delete rule, i.e. RESTRICT:
//   refunds.order_id, refunds.payment_id, order_returns.order_id,
//   group_buy_participants.order_id, loyalty_points_ledger.order_id,
//   affiliate_conversions.order_id
// Any one of them would abort `DELETE FROM orders`. They're cleared first,
// deepest-first among themselves (refunds before the disputes/returns they
// hang off), and everything after that is left to CASCADE.
//
// If some FK not listed here also turns out to RESTRICT, the DELETE fails,
// the surrounding transaction rolls back, and nothing is half-deleted -
// which is the only acceptable failure mode for an irreversible action.
exports.deleteOrderTree = async (connection, orderIds) => {
    if (!orderIds.length) return { orders: 0 };

    // RESTRICT-level dependents, cleared before the orders themselves.
    await runInChunks(connection, "DELETE FROM refunds WHERE order_id IN (?)", orderIds);
    await runInChunks(connection, "DELETE FROM order_returns WHERE order_id IN (?)", orderIds);
    await runInChunks(connection, "DELETE FROM affiliate_conversions WHERE order_id IN (?)", orderIds);
    await runInChunks(connection, "DELETE FROM loyalty_points_ledger WHERE order_id IN (?)", orderIds);

    // A group-buy participant is a record of someone joining a group buy,
    // which is real even if the order it produced is being cleared - so
    // the link is cut rather than the row removed (the column is nullable
    // precisely for the "joined, hasn't bought" state).
    await runInChunks(
        connection,
        "UPDATE group_buy_participants SET order_id = NULL WHERE order_id IN (?)",
        orderIds
    );

    // coupon_redemptions.order_id has no FK constraint, so it wouldn't
    // block the delete - but leaving redemptions pointing at order ids
    // that no longer exist would silently keep a coupon's usage count
    // inflated, which is exactly the kind of skewed number this tooling
    // exists to fix.
    await runInChunks(connection, "DELETE FROM coupon_redemptions WHERE order_id IN (?)", orderIds);

    // Everything else - order_items, payments, deliveries, delivery_offers,
    // delivery_ratings, agent_earnings, disputes (+ evidence/history/
    // messages), efd_receipts - cascades from here. notifications and
    // conversations point at orders with ON DELETE SET NULL and are left
    // in place with a null reference.
    const orders = await runInChunks(connection, "DELETE FROM orders WHERE id IN (?)", orderIds);

    return { orders };
};

// ---- Per-seller deletes ---------------------------------------------------

exports.deleteSellerReviews = (connection, sellerId, { testOnly }) =>
    connection
        .query(
            `DELETE r FROM reviews r
            JOIN products p ON p.id = r.product_id
            WHERE p.seller_id = ?${testOnly ? " AND r.is_test = TRUE" : ""}`,
            [sellerId]
        )
        .then(([result]) => result.affectedRows || 0);

exports.deleteSellerConversations = (connection, sellerId, { testOnly }) =>
    connection
        .query(
            `DELETE FROM conversations WHERE seller_id = ?${testOnly ? " AND is_test = TRUE" : ""}`,
            [sellerId]
        )
        .then(([result]) => result.affectedRows || 0);

// Disputes and returns tied to an in-scope order are already gone via the
// order tree above; this catches a seller's rows whose order fell outside
// the scope (a test-only reset where the dispute is flagged but its order
// isn't, most obviously).
exports.deleteSellerDisputes = (connection, sellerId, { testOnly }) =>
    connection
        .query(
            `DELETE FROM disputes WHERE seller_id = ?${testOnly ? " AND is_test = TRUE" : ""}`,
            [sellerId]
        )
        .then(([result]) => result.affectedRows || 0);

exports.deleteSellerReturns = (connection, sellerId, { testOnly }) =>
    connection
        .query(
            `DELETE FROM order_returns WHERE seller_id = ?${testOnly ? " AND is_test = TRUE" : ""}`,
            [sellerId]
        )
        .then(([result]) => result.affectedRows || 0);

exports.deleteSellerWalletLedger = async (connection, sellerId, { testOnly }) => {
    const [tx] = await connection.query(
        `DELETE FROM wallet_transactions WHERE seller_id = ?${testOnly ? " AND is_test = TRUE" : ""}`,
        [sellerId]
    );

    // Withdrawal requests have no is_test flag of their own (they aren't in
    // the Phase 1 scope list) - they're cleared only on a full reset of a
    // seller, never on a test-only pass, since a pending real withdrawal
    // disappearing would be a genuine money problem.
    let withdrawals = 0;
    if (!testOnly) {
        const [w] = await connection.query(
            "DELETE FROM withdrawal_requests WHERE seller_id = ?",
            [sellerId]
        );
        withdrawals = w.affectedRows || 0;
    }

    return { wallet_transactions: tx.affectedRows || 0, withdrawal_requests: withdrawals };
};

// Buyer-side ledger rows that referenced a now-deleted order. There's no FK
// here (buyer_wallet_transactions.reference_id is a loose reference, same
// shape as wallet_transactions.reference_id), so nothing removes these
// automatically and they'd otherwise keep a buyer's balance reconciling
// against payments for orders that no longer exist.
exports.deleteBuyerLedgerForOrders = (connection, orderIds) =>
    runInChunks(
        connection,
        `DELETE FROM buyer_wallet_transactions
        WHERE reference_type IN ('order_payment', 'refund') AND reference_id IN (?)`,
        orderIds
    );

exports.deleteAllBuyerLedger = (connection, { testOnly }) =>
    connection
        .query(
            `DELETE FROM buyer_wallet_transactions ${testOnly ? "WHERE is_test = TRUE" : ""}`
        )
        .then(([result]) => result.affectedRows || 0);

// ---- Platform-wide deletes ------------------------------------------------

exports.deleteAllReviews = (connection, { testOnly }) =>
    connection
        .query(`DELETE FROM reviews ${testOnly ? "WHERE is_test = TRUE" : ""}`)
        .then(([result]) => result.affectedRows || 0);

exports.deleteAllConversations = (connection, { testOnly }) =>
    connection
        .query(`DELETE FROM conversations ${testOnly ? "WHERE is_test = TRUE" : ""}`)
        .then(([result]) => result.affectedRows || 0);

exports.deleteAllDisputes = (connection, { testOnly }) =>
    connection
        .query(`DELETE FROM disputes ${testOnly ? "WHERE is_test = TRUE" : ""}`)
        .then(([result]) => result.affectedRows || 0);

exports.deleteAllReturns = (connection, { testOnly }) =>
    connection
        .query(`DELETE FROM order_returns ${testOnly ? "WHERE is_test = TRUE" : ""}`)
        .then(([result]) => result.affectedRows || 0);

exports.deleteAllWalletLedger = async (connection, { testOnly }) => {
    const [tx] = await connection.query(
        `DELETE FROM wallet_transactions ${testOnly ? "WHERE is_test = TRUE" : ""}`
    );

    let withdrawals = 0;
    if (!testOnly) {
        const [w] = await connection.query("DELETE FROM withdrawal_requests");
        withdrawals = w.affectedRows || 0;
    }

    return { wallet_transactions: tx.affectedRows || 0, withdrawal_requests: withdrawals };
};

// ---- Balance reconciliation ----------------------------------------------
// seller_wallets/buyer_wallets store a running balance that the ledger is
// supposed to reconcile to (see migration 017's design note: "every balance
// change writes a transaction row with the resulting balance, so the
// balance can always be reconciled from history"). Deleting ledger rows
// without recomputing would leave that invariant broken - a wallet showing
// a balance no surviving transaction accounts for, which is the same class
// of wrong number this tooling is meant to remove. Recomputed from what's
// left rather than zeroed, so a test-only reset preserves real balances.
exports.recomputeSellerWallets = (connection, sellerId = null) =>
    connection
        .query(
            `UPDATE seller_wallets w
            SET w.balance = COALESCE((
                    SELECT SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END)
                    FROM wallet_transactions t WHERE t.seller_id = w.seller_id
                ), 0),
                w.held_balance = 0
            ${sellerId ? "WHERE w.seller_id = ?" : ""}`,
            sellerId ? [sellerId] : []
        )
        .then(([result]) => result.affectedRows || 0);

exports.recomputeBuyerWallets = (connection) =>
    connection
        .query(
            `UPDATE buyer_wallets w
            SET w.balance = COALESCE((
                SELECT SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END)
                FROM buyer_wallet_transactions t WHERE t.buyer_id = w.buyer_id
            ), 0)`
        )
        .then(([result]) => result.affectedRows || 0);

// ---- Target lookup --------------------------------------------------------

exports.findSeller = async (sellerId) => {
    const [[row]] = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, sp.store_name
        FROM users u
        LEFT JOIN seller_profiles sp ON sp.user_id = u.id
        WHERE u.id = ?`,
        [sellerId]
    );
    return row || null;
};
