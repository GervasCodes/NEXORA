const db = require("../../config/db");

// Credited, not-yet-reversed items for an order or (for a multi-vendor
// parent) all of its child orders. Row-locked: the reversal below runs in a
// transaction so a release job and a chargeback cannot both move the same
// earnings.
exports.findReversibleOrderItems = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT oi.id, oi.order_id, oi.seller_id, oi.seller_net_amount, oi.wallet_released
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE (o.id = ? OR o.parent_order_id = ?)
            AND oi.wallet_credited = TRUE
            AND oi.chargeback_reversed_at IS NULL
        FOR UPDATE`,
        [orderId, orderId]
    );
    return rows;
};

// Marking wallet_released = TRUE also closes the item for the escrow
// release job (it only looks at wallet_released = FALSE), so a charged-back
// item can never be released to the seller later.
exports.markItemsReversed = async (itemIds, executor = db) => {
    if (itemIds.length === 0) return;
    await executor.query(
        `UPDATE order_items SET chargeback_reversed_at = NOW(), wallet_released = TRUE
        WHERE id IN (${itemIds.map(() => "?").join(", ")})`,
        itemIds
    );
};

exports.sumBookingProviderNet = async (bookingId) => {
    const [[row]] = await db.query(
        `SELECT b.provider_id, COALESCE(SUM(bi.provider_net_amount), 0) AS net
        FROM bookings b
        LEFT JOIN booking_items bi ON bi.booking_id = b.id AND bi.wallet_credited = TRUE
        WHERE b.id = ?
        GROUP BY b.provider_id`,
        [bookingId]
    );
    return row ? { providerId: row.provider_id, net: Number(row.net) } : null;
};
