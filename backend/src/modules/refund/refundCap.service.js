/**
 * refundCap.service.js (Phase 5, P0).
 *
 * Disputes, returns and cancellations each used to compute "how much to
 * refund" with no idea what the *other two* paths had already refunded
 * for the same order - nothing stopped a buyer from, say, winning a
 * dispute refund for an item and then also getting it refunded again
 * through a return, or a partial dispute refund followed by a full
 * cancellation refund on the same order. This module is the one place
 * that checks "does this refund fit within what's actually left to
 * refund" and reserves it, under a row lock, before any of those three
 * callers go ahead and trigger money movement.
 *
 * Usage: call reserveRefund() with a short-lived transaction connection
 * *before* committing the status change that represents "this refund is
 * happening" (dispute resolved, return marked received, order
 * cancelled). On failure it throws - the caller should let that abort
 * the whole decision rather than resolve/cancel and then discover the
 * cap was already exceeded.
 */

const db = require("../../config/db");
const orderRepository = require("../order/order.repository");

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Locks the order row (and, if orderItemId is given, that order_item
 * row) inside `connection`'s transaction, checks the requested amount
 * against what's left to refund, and - if it fits - increments the
 * running total_refunded counters in the same transaction. Returns the
 * amount actually reserved (equal to `amount` on success).
 *
 * Throws if `amount` would push total_refunded past what was paid.
 * Callers that want a "cap at what's left" behavior instead of a hard
 * reject should pre-clamp `amount` against getMaxRefundable() first.
 */
exports.reserveRefund = async (connection, { orderId, orderItemId, amount }) => {
    const requested = round2(amount);
    if (!requested || requested <= 0) {
        throw new Error("Refund amount must be positive");
    }

    const [orderRows] = await connection.query(
        "SELECT id, total_amount, total_refunded FROM orders WHERE id = ? FOR UPDATE",
        [orderId]
    );
    const order = orderRows[0];
    if (!order) throw new Error("Order not found");

    const orderRemaining = round2(order.total_amount) - round2(order.total_refunded);

    if (orderItemId) {
        const [itemRows] = await connection.query(
            "SELECT id, subtotal, total_refunded FROM order_items WHERE id = ? AND order_id = ? FOR UPDATE",
            [orderItemId, orderId]
        );
        const item = itemRows[0];
        if (!item) throw new Error("Order item not found on this order");

        const itemRemaining = round2(item.subtotal) - round2(item.total_refunded);
        const cap = Math.min(itemRemaining, orderRemaining);

        if (requested > cap + 0.01) {
            throw new Error(
                `Refund of ${requested} would exceed what's left to refund for this item (${Math.max(0, cap)} remaining)`
            );
        }

        await connection.query(
            "UPDATE order_items SET total_refunded = total_refunded + ? WHERE id = ?",
            [requested, orderItemId]
        );
    } else if (requested > orderRemaining + 0.01) {
        throw new Error(
            `Refund of ${requested} would exceed what's left to refund on this order (${Math.max(0, orderRemaining)} remaining)`
        );
    }

    await connection.query(
        "UPDATE orders SET total_refunded = total_refunded + ? WHERE id = ?",
        [requested, orderId]
    );

    return requested;
};

/**
 * Read-only check (no lock held past the call) for callers that want to
 * show/validate a maximum before the user commits to an action - e.g.
 * dispute.service.js clamping an admin's requested refund_amount, or a
 * future "how much can still be refunded" display. Not safe to rely on
 * for the actual cap enforcement under concurrency - reserveRefund()
 * above, inside a transaction, is what actually prevents a race.
 */
exports.getMaxRefundable = async ({ orderId, orderItemId }) => {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) throw new Error("Order not found");
    const orderRemaining = round2(order.total_amount) - round2(order.total_refunded);

    if (!orderItemId) return Math.max(0, orderRemaining);

    const items = await orderRepository.findOrderItems(orderId);
    const item = items.find((i) => i.id === Number(orderItemId));
    if (!item) throw new Error("Order item not found on this order");

    const itemRemaining = round2(item.subtotal) - round2(item.total_refunded || 0);
    return Math.max(0, Math.min(itemRemaining, orderRemaining));
};

exports.withTransaction = async (fn) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};
