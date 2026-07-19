const db = require("../../config/db");

// Shared by createOrder/createSplitOrder below: insert one `orders` row
// (optionally as a child of `parentOrderId`) and return its insertId.
const insertOrderRow = async (connection, { buyerId, parentOrderId, isParent, orderNumber, shippingInfo, totalAmount }) => {
    const [orderResult] = await connection.query(
        `INSERT INTO orders
        (order_number, buyer_id, parent_order_id, is_parent, status, payment_status, payment_method,
         shipping_address, shipping_city, shipping_region, shipping_phone,
         delivery_lat, delivery_lng, total_amount)
        VALUES (?, ?, ?, ?, 'pending', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            orderNumber,
            buyerId,
            parentOrderId ?? null,
            isParent ? 1 : 0,
            shippingInfo.payment_method,
            shippingInfo.shipping_address,
            shippingInfo.shipping_city,
            shippingInfo.shipping_region,
            shippingInfo.shipping_phone,
            shippingInfo.delivery_lat ?? null,
            shippingInfo.delivery_lng ?? null,
            totalAmount
        ]
    );

    return orderResult.insertId;
};

// Insert this order's line items + decrement stock. Throws (and lets the
// caller roll back) if any item no longer has enough stock.
const insertOrderItems = async (connection, orderId, cartItems) => {
    for (const item of cartItems) {
        await connection.query(
            `INSERT INTO order_items
            (order_id, product_id, seller_id, quantity, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                orderId,
                item.product_id,
                item.seller_id,
                item.quantity,
                item.unit_price,
                item.subtotal
            ]
        );

        const [stockResult] = await connection.query(
            "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
            [item.quantity, item.product_id, item.quantity]
        );

        if (stockResult.affectedRows === 0) {
            throw new Error(`"${item.name}" no longer has enough stock`);
        }
    }
};

// Create a single (non-split) order + its items + decrement stock, all in
// one transaction. cartItems: rows from cart_items joined with product
// price/stock (see order.service.js). Used for single-vendor checkouts.
exports.createOrder = async (buyerId, orderNumber, shippingInfo, cartItems, totalAmount) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const orderId = await insertOrderRow(connection, {
            buyerId, parentOrderId: null, isParent: false, orderNumber, shippingInfo, totalAmount
        });

        await insertOrderItems(connection, orderId, cartItems);

        await connection.query(
            "DELETE FROM cart_items WHERE user_id = ?",
            [buyerId]
        );

        await connection.commit();

        return orderId;

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// Create a multi-vendor order: one parent order (buyer-facing, holds
// payment/shipping/total, no items of its own) plus one child order per
// vendor (holds that vendor's items and gets its own independent
// status/delivery). All in one transaction.
//
// sellerGroups: array of { sellerId, items, subtotal } - `items` in the
// same shape createOrder expects, `subtotal` is that seller's slice of
// the cart total.
exports.createSplitOrder = async (buyerId, parentOrderNumber, shippingInfo, sellerGroups, totalAmount) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const parentOrderId = await insertOrderRow(connection, {
            buyerId, parentOrderId: null, isParent: true, orderNumber: parentOrderNumber, shippingInfo, totalAmount
        });

        const childOrders = [];
        let vendorIndex = 1;

        for (const group of sellerGroups) {
            const childOrderNumber = `${parentOrderNumber}-V${vendorIndex}`;

            const childOrderId = await insertOrderRow(connection, {
                buyerId,
                parentOrderId,
                isParent: false,
                orderNumber: childOrderNumber,
                shippingInfo,
                totalAmount: group.subtotal
            });

            await insertOrderItems(connection, childOrderId, group.items);

            childOrders.push({
                sellerId: group.sellerId,
                orderId: childOrderId,
                orderNumber: childOrderNumber
            });

            vendorIndex += 1;
        }

        await connection.query(
            "DELETE FROM cart_items WHERE user_id = ?",
            [buyerId]
        );

        await connection.commit();

        return { parentOrderId, childOrders };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// Orders placed via mobile money that never got a payment confirmation
// webhook (buyer abandoned the USSD prompt, network issue, etc.) and
// have sat unpaid/pending past the cutoff - candidates for the
// staleOrders background job to auto-cancel, freeing the buyer to retry
// instead of an order sitting in limbo forever.
// Only top-level orders (standalone or parent) - child orders are never
// auto-cancelled on their own, they follow their parent (see
// orderService.autoCancelStaleOrder).
exports.findStalePendingMobileMoneyOrders = async (olderThanMinutes) => {
    const [rows] = await db.query(
        `SELECT id, buyer_id, order_number, is_parent FROM orders
        WHERE status = 'pending' AND payment_status = 'unpaid' AND payment_method = 'mobile_money'
        AND parent_order_id IS NULL
        AND created_at < (NOW() - INTERVAL ? MINUTE)`,
        [olderThanMinutes]
    );
    return rows;
};

// Only top-level orders: standalone orders and parent orders. Child
// orders (parent_order_id set) are reached via a parent's detail view,
// not listed separately here, so a split cart shows as one row.
exports.findOrdersByBuyer = async (buyerId) => {
    const [rows] = await db.query(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at, o.is_parent,
                (SELECT COUNT(*) FROM orders c WHERE c.parent_order_id = o.id) AS vendor_count
        FROM orders o
        WHERE o.buyer_id = ? AND o.parent_order_id IS NULL
        ORDER BY o.created_at DESC`,
        [buyerId]
    );
    return rows;
};

// Every vendor child order under a parent order, in the order they were
// created (V1, V2, ...).
exports.findChildOrders = async (parentOrderId) => {
    const [rows] = await db.query(
        `SELECT * FROM orders WHERE parent_order_id = ? ORDER BY id ASC`,
        [parentOrderId]
    );
    return rows;
};

exports.findOrderById = async (orderId) => {
    const [rows] = await db.query(
        "SELECT * FROM orders WHERE id = ?",
        [orderId]
    );
    return rows[0];
};

exports.findOrderItems = async (orderId) => {
    const [rows] = await db.query(
        `SELECT oi.*, p.name, p.slug
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?`,
        [orderId]
    );
    return rows;
};

exports.updateOrderStatus = async (orderId, status) => {
    await db.query(
        "UPDATE orders SET status = ? WHERE id = ?",
        [status, orderId]
    );
};

// Set when a seller ships an order: 'platform' (open pool, any agent can
// claim) or 'own' (assigned directly to one of the seller's own agents).
exports.setDeliveryMode = async (orderId, mode) => {
    await db.query(
        "UPDATE orders SET delivery_mode = ? WHERE id = ?",
        [mode, orderId]
    );
};

exports.updatePaymentStatus = async (orderId, paymentStatus) => {
    await db.query(
        "UPDATE orders SET payment_status = ? WHERE id = ?",
        [paymentStatus, orderId]
    );
};

// A parent order is paid for once by the buyer, but each vendor child
// order tracks its own payment_status too (sellers/agents read it off
// their own order row) - this keeps them all in sync with the parent.
exports.updatePaymentStatusForChildren = async (parentOrderId, paymentStatus) => {
    await db.query(
        "UPDATE orders SET payment_status = ? WHERE parent_order_id = ?",
        [paymentStatus, parentOrderId]
    );
};

// Orders that contain at least one item belonging to this seller
exports.findOrdersBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT o.id, o.order_number, o.status, o.payment_status,
                o.total_amount, o.created_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
        ORDER BY o.created_at DESC`,
        [sellerId]
    );
    return rows;
};

// Every non-parent order (standalone or child) has exactly one seller
// across all its order_items by construction (see createSplitOrder) -
// used by deliveryPricing.service.js to find whose pickup pin to measure
// distance from. Returns undefined for a parent order (no items of its
// own) or an order with no items at all.
exports.findOrderSellerId = async (orderId) => {
    const [rows] = await db.query(
        "SELECT seller_id FROM order_items WHERE order_id = ? LIMIT 1",
        [orderId]
    );
    return rows[0]?.seller_id;
};

// Whether this seller owns at least one item in the given order
exports.sellerHasItemInOrder = async (orderId, sellerId) => {
    const [rows] = await db.query(
        "SELECT id FROM order_items WHERE order_id = ? AND seller_id = ? LIMIT 1",
        [orderId, sellerId]
    );
    return rows.length > 0;
};

// Only this seller's line items within a (possibly multi-vendor) order
exports.findOrderItemsBySeller = async (orderId, sellerId) => {
    const [rows] = await db.query(
        `SELECT oi.*, p.name, p.slug
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ? AND oi.seller_id = ?`,
        [orderId, sellerId]
    );
    return rows;
};
