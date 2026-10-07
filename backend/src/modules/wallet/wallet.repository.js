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

// Escrow earnings from orders paid by a platform-captured
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
// commission_rate/commission_amount/seller_net_amount are included here
// because Phase 2 snapshots them at checkout (order.service.js) - when
// present, creditSellersForOrder uses them as-is instead of recomputing
// against whatever the seller's commission rate happens to be right now.
exports.findUncreditedItemsByOrder = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT id, seller_id, subtotal, commission_rate, commission_amount, seller_net_amount
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
// start out held and wait for  release job.
exports.markItemCredited = async (itemId, commissionRate, commissionAmount, netAmount, released, executor = db) => {
    await executor.query(
        `UPDATE order_items
        SET commission_rate = ?, commission_amount = ?, seller_net_amount = ?,
            wallet_credited = TRUE, wallet_released = ?
        WHERE id = ?`,
        [commissionRate, commissionAmount, netAmount, released, itemId]
    );
};

// (Backend N+1 Fixes & Read Replica Adoption): batched version of
// markItemCredited above, for wallet.service.js#creditSellersForOrder's
// per-item loop - one UPDATE covering every item in the order instead of
// one UPDATE per item (a webhook processing a multi-item order previously
// did N round trips here). Unlike order.repository.js's
// updateOrderStatusForChildren (same value for every matched row), each
// item genuinely gets a *different* commission_rate/commission_amount/
// seller_net_amount - a plain `SET col = ? WHERE id IN (?)` can't express
// that, so this uses one CASE WHEN expression per varying column.
// `released` (wallet_released) IS the same for every item in one call
// (it's a property of the order's payment method, not the item - see
// creditSellersForOrder), so that column stays a plain `= ?` rather than
// needing its own CASE.
//
// `items` is [{ id, commissionRate, commissionAmount, netAmount }, ...].
// Callers are expected to have already deduplicated/validated ids -
// this trusts its input the same way markItemCredited above does.
exports.markItemsCredited = async (items, released, executor = db) => {
    if (items.length === 0) return;

    // A single-item order is still correctly handled by the general
    // case below (a CASE WHEN with exactly one WHEN clause), so there's
    // no need for a separate non-batched code path here.
    const rateCase = items.map(() => "WHEN ? THEN ?").join(" ");
    const amountCase = items.map(() => "WHEN ? THEN ?").join(" ");
    const netCase = items.map(() => "WHEN ? THEN ?").join(" ");
    const placeholders = items.map(() => "?").join(", ");

    const rateParams = items.flatMap((item) => [item.id, item.commissionRate]);
    const amountParams = items.flatMap((item) => [item.id, item.commissionAmount]);
    const netParams = items.flatMap((item) => [item.id, item.netAmount]);
    const idParams = items.map((item) => item.id);

    await executor.query(
        `UPDATE order_items
        SET
            commission_rate = CASE id ${rateCase} END,
            commission_amount = CASE id ${amountCase} END,
            seller_net_amount = CASE id ${netCase} END,
            wallet_credited = TRUE,
            wallet_released = ?
        WHERE id IN (${placeholders})`,
        [...rateParams, ...amountParams, ...netParams, released, ...idParams]
    );
};

// ---- Escrow release  ---------------------------------------------

// The  background job scans: items whose earnings were
// credited (Phase 9C - into held_balance for anything but Cash on
// Delivery) but not yet released, whose order has actually been
// delivered, and whose delivery happened at least `holdDays` ago. Callers
// still need to apply the dispute-freeze rule themselves (see
// wallet.service.js#releaseEligibleEarnings) - this query only handles
// the timing half of "eligible for release".
// Escrow must not release before the buyer's return window closes
// (Phase 5) - releasing earnings while a return could still be opened
// would make a seller's money withdrawable, then potentially need
// reversing (possibly into a negative balance) the moment a return
// comes in. holdDays (the escrow_hold_days setting) is now a *floor*,
// not the only gate: the actual wait is GREATEST(escrow hold days, the
// return window that applies to this specific order - 14 days if it
// bought buyer-protection insurance, otherwise the plain return window).
exports.findReleasableItems = async (holdDays, returnWindowDays, returnWindowInsuredDays, executor = db) => {
    const [rows] = await executor.query(
        `SELECT oi.id, oi.order_id, oi.seller_id, oi.seller_net_amount
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN deliveries d ON d.order_id = o.id
        WHERE oi.wallet_credited = TRUE
            AND oi.wallet_released = FALSE
            AND o.status = 'delivered'
            AND d.delivered_at IS NOT NULL
            AND d.delivered_at <= (NOW() - INTERVAL GREATEST(?, IF(o.buyer_protection_addon, ?, ?)) DAY)`,
        [Number(holdDays), Number(returnWindowInsuredDays), Number(returnWindowDays)]
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

// Cancel a paid order (Phase 3, P0) - every already-credited item for a
// standalone/parent order's whole tree (covers the multi-vendor split
// case, where items live on child orders rather than the parent row - see
// order.repository.js#restoreStockForChildOrders for the same `orders`
// self-join shape). FOR UPDATE so a cancel racing the escrow-release job
// for the same order can't read a half-updated held_balance.
exports.findCreditedItemsForOrderTree = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT oi.id, oi.seller_id, oi.seller_net_amount
        FROM order_items oi
        WHERE oi.wallet_credited = TRUE AND oi.wallet_released = FALSE
            AND (oi.order_id = ? OR oi.order_id IN (SELECT id FROM orders WHERE parent_order_id = ?))
        FOR UPDATE`,
        [orderId, orderId]
    );
    return rows;
};

// Batched counterpart of markItemReleased, for reverseSellerEarningsForOrder
// below - one UPDATE for every item being closed out by a cancellation
// instead of one per item.
exports.markItemsReleased = async (itemIds, executor = db) => {
    if (!itemIds.length) return;
    await executor.query(
        "UPDATE order_items SET wallet_released = TRUE WHERE id IN (?)",
        [itemIds]
    );
};

// ---- Booking items (Financial Integration) -----------------------
// Byte-for-byte the same shape as the order_items functions above, against
// booking_items/bookings instead - see migration 064's design notes for why
// this is a parallel set rather than a generic "order OR booking" parameter
// threaded through the order-side functions (bookings' provider_id/
// booking_items columns are named for this domain, not reused column names).

exports.findUncreditedItemsByBooking = async (bookingId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT bi.id, b.provider_id, bi.subtotal
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.booking_id = ? AND bi.wallet_credited = FALSE
        FOR UPDATE`,
        [bookingId]
    );
    return rows;
};

exports.markBookingItemCredited = async (itemId, commissionRate, commissionAmount, netAmount, released, executor = db) => {
    await executor.query(
        `UPDATE booking_items
        SET commission_rate = ?, commission_amount = ?, provider_net_amount = ?,
            wallet_credited = TRUE, wallet_released = ?
        WHERE id = ?`,
        [commissionRate, commissionAmount, netAmount, released, itemId]
    );
};

// The set the booking escrow release scan needs: items credited (held)
// but not yet released, whose booking has actually completed, and whose
// completion happened at least `holdDays` ago. There's no dispute system
// for bookings (see migration 064), so - unlike findReleasableItems for
// orders - this is the whole eligibility check, not just the timing half;
// wallet.service.js#releaseEligibleBookingEarnings applies no further
// freeze rule on top.
exports.findReleasableBookingItems = async (holdDays, executor = db) => {
    const [rows] = await executor.query(
        `SELECT bi.id, bi.booking_id, b.provider_id, bi.provider_net_amount
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.wallet_credited = TRUE
            AND bi.wallet_released = FALSE
            AND b.status = 'completed'
            AND b.updated_at <= (NOW() - INTERVAL ? DAY)`,
        [Number(holdDays)]
    );
    return rows;
};

// Every not-yet-released, credited item for one booking, regardless of
// completion status or hold-day timing - backs the admin manual
// early-release action, same reasoning as findReleasableItemsForOrder.
exports.findReleasableBookingItemsForBooking = async (bookingId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT bi.id, bi.booking_id, b.provider_id, bi.provider_net_amount
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.booking_id = ? AND bi.wallet_credited = TRUE AND bi.wallet_released = FALSE`,
        [bookingId]
    );
    return rows;
};

exports.markBookingItemReleased = async (itemId, executor = db) => {
    await executor.query(
        "UPDATE booking_items SET wallet_released = TRUE WHERE id = ?",
        [itemId]
    );
};

// ---- Withdrawal requests ----------------------------------------------------

// payoutCurrency/payoutAmount/payoutExchangeRate ( multi-
// currency payouts) default to TZS/null/null when the caller doesn't
// pass them, so any existing call site keeps behaving exactly as
// before this column existed.
// holdUntil/payoutDetailsIsNew (Phase 2): the 24-hour hold on a seller's
// first-ever withdrawal to a given payout method+details combination -
// see wallet.service.js#requestWithdrawal for how they're computed.
exports.createWithdrawal = async (
    sellerId, amount, payoutMethod, payoutDetails, executor = db,
    payoutCurrency = "TZS", payoutAmount = null, payoutExchangeRate = null,
    holdUntil = null, payoutDetailsIsNew = false
) => {
    const [result] = await executor.query(
        `INSERT INTO withdrawal_requests
        (seller_id, amount, payout_method, payout_details, payout_currency, payout_amount, payout_exchange_rate, hold_until, payout_details_is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sellerId, amount, payoutMethod, payoutDetails, payoutCurrency, payoutAmount, payoutExchangeRate, holdUntil, payoutDetailsIsNew]
    );
    return result.insertId;
};

// Has this seller ever had a withdrawal (any status except rejected - a
// rejected one never actually reached this payout detail) to this exact
// payout method+details combination before? Used to decide whether a NEW
// request needs the 24-hour first-time-payout-details hold.
exports.hasPriorPayoutUsage = async (sellerId, payoutMethod, payoutDetails) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS count FROM withdrawal_requests
        WHERE seller_id = ? AND payout_method = ? AND payout_details = ? AND status != 'rejected'`,
        [sellerId, payoutMethod, payoutDetails]
    );
    return Number(row.count) > 0;
};

// Sum of this seller's withdrawals requested today (server "today", UTC
// date boundary), excluding rejected ones - used for the daily cap.
exports.sumWithdrawalsRequestedToday = async (sellerId) => {
    const [[row]] = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawal_requests
        WHERE seller_id = ? AND status != 'rejected' AND DATE(requested_at) = CURDATE()`,
        [sellerId]
    );
    return Number(row.total);
};

exports.findWithdrawalsBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT id, amount, status, payout_method, payout_details, admin_note, requested_at, processed_at,
                payout_currency, payout_amount, payout_exchange_rate, payout_reference, hold_until
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
                wr.payout_currency, wr.payout_amount, wr.payout_exchange_rate,
                wr.payout_reference, wr.hold_until, wr.payout_details_is_new,
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

// payoutReference (Phase 2): the receipt/reference an admin records when
// marking a withdrawal "paid" - required by wallet.service.js#processWithdrawal
// for that action, optional (and typically unused) for approve/reject.
exports.updateWithdrawalStatus = async (id, status, adminNote, executor = db, payoutReference = null) => {
    await executor.query(
        `UPDATE withdrawal_requests
        SET status = ?, admin_note = ?, processed_at = NOW(), payout_reference = COALESCE(?, payout_reference)
        WHERE id = ?`,
        [status, adminNote ?? null, payoutReference, id]
    );
};

// A seller's users.verification_tier - used for the withdrawal daily cap
// (higher tier, higher cap; see wallet.service.js#requestWithdrawal).
exports.getSellerVerificationTier = async (sellerId) => {
    const [rows] = await db.query("SELECT verification_tier FROM users WHERE id = ?", [sellerId]);
    return rows[0] ? rows[0].verification_tier : "none";
};

// ---- Negative seller balances (Phase 2) -----------------------------------
// Admin-visible list: a seller's future earnings automatically repay the
// deficit (every credit is a plain balance += delta), so this is purely
// informational - nothing here needs to "do" anything about a negative
// balance, just surface it.
// ---- Nightly wallet reconciliation (Phase 2) ------------------------------
// Recomputes each wallet's balance from its own ledger (wallet_transactions)
// and compares it with the balance column actually on the row - any
// mismatch means a code path somewhere updated one without the other (or a
// direct DB edit). Scoped to wallets with at least one ledger row so an
// untouched wallet isn't reported as "drifted" against its own default 0.
exports.findBalanceDrift = async () => {
    const [rows] = await db.query(
        `SELECT sw.seller_id AS owner_id, sw.balance AS recorded_balance,
                COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE -wt.amount END), 0) AS computed_balance
        FROM seller_wallets sw
        JOIN wallet_transactions wt ON wt.seller_id = sw.seller_id
        GROUP BY sw.seller_id, sw.balance
        HAVING ABS(sw.balance - computed_balance) > 0.01`
    );
    return rows;
};

exports.insertReconciliationFlag = async ({ walletType, ownerId, recordedBalance, computedBalance }) => {
    await db.query(
        `INSERT INTO wallet_reconciliation_flags (wallet_type, owner_id, recorded_balance, computed_balance, drift)
        VALUES (?, ?, ?, ?, ?)`,
        [walletType, ownerId, recordedBalance, computedBalance, Number((recordedBalance - computedBalance).toFixed(2))]
    );
};

exports.findOpenReconciliationFlags = async () => {
    const [rows] = await db.query(
        "SELECT * FROM wallet_reconciliation_flags WHERE status = 'open' ORDER BY created_at DESC"
    );
    return rows;
};

// --- Phase 8: paged + filtered withdrawal list for the admin queue ---
// Tab counts and totals ignore the search/status filter so each tab shows
// its real size. Pending sorts oldest first (the queue order admins work
// through); other views stay newest first.
// Whitelisted admin sort orders for the paged withdrawals list. Anything
// else falls back to the default queue order below.
const WITHDRAWAL_SORTS = {
    amount_desc: "wr.amount DESC, wr.id DESC",
    amount_asc: "wr.amount ASC, wr.id ASC",
    requested_asc: "wr.requested_at ASC, wr.id ASC",
    requested_desc: "wr.requested_at DESC, wr.id DESC"
};

exports.findWithdrawalsPage = async ({ q, status, sort, limit, offset }) => {
    const { likeTerm, isNumericTerm } = require("../../utils/adminListQuery");
    const conditions = ["1 = 1"];
    const params = [];

    if (status) {
        conditions.push("wr.status = ?");
        params.push(status);
    }
    if (q) {
        const like = likeTerm(q);
        const clauses = [
            "sp.store_name LIKE ?",
            "u.email LIKE ?",
            "CONCAT(u.first_name, ' ', u.last_name) LIKE ?",
            "wr.payout_reference LIKE ?"
        ];
        params.push(like, like, like, like);
        if (isNumericTerm(q)) {
            clauses.push("wr.id = ?");
            params.push(Number(q));
        }
        conditions.push(`(${clauses.join(" OR ")})`);
    }

    const where = conditions.join(" AND ");
    const orderBy = WITHDRAWAL_SORTS[sort]
        || (status === "pending" ? "wr.requested_at ASC, wr.id ASC" : "wr.requested_at DESC, wr.id DESC");
    const joins = `FROM withdrawal_requests wr
        JOIN users u ON u.id = wr.seller_id
        LEFT JOIN seller_profiles sp ON sp.user_id = wr.seller_id`;

    const [[countRow]] = await db.query(`SELECT COUNT(*) AS total ${joins} WHERE ${where}`, params);
    const [rows] = await db.query(
        `SELECT wr.id, wr.seller_id, wr.amount, wr.status, wr.payout_method, wr.payout_details,
                wr.admin_note, wr.requested_at, wr.processed_at,
                wr.payout_currency, wr.payout_amount, wr.payout_exchange_rate,
                wr.payout_reference, wr.hold_until, wr.payout_details_is_new,
                sp.store_name, u.first_name, u.last_name, u.email
        ${joins}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    return { rows, total: Number(countRow.total) };
};

exports.findWithdrawalTotalsByStatus = async () => {
    const [rows] = await db.query(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
        FROM withdrawal_requests
        GROUP BY status`
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.count), amount: Number(r.amount) }));
};
