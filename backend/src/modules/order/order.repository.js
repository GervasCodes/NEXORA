const db = require("../../config/db");

// Create an order + its items + decrement stock, all in one transaction.
// cartItems: rows from cart_items joined with product price/stock (see order.service.js)
exports.createOrder = async (buyerId, orderNumber, shippingInfo, cartItems, totalAmount) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [orderResult] = await connection.query(
            `INSERT INTO orders
            (order_number, buyer_id, status, payment_status, payment_method,
             shipping_address, shipping_city, shipping_region, shipping_phone,
             delivery_lat, delivery_lng, total_amount)
            VALUES (?, ?, 'pending', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                buyerId,
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

        const orderId = orderResult.insertId;

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

// Orders placed via mobile money that never got a payment confirmation
// webhook (buyer abandoned the USSD prompt, network issue, etc.) and
// have sat unpaid/pending past the cutoff - candidates for the
// staleOrders background job to auto-cancel, freeing the buyer to retry
// instead of an order sitting in limbo forever.
exports.findStalePendingMobileMoneyOrders = async (olderThanMinutes) => {
    const [rows] = await db.query(
        `SELECT id, buyer_id, order_number FROM orders
        WHERE status = 'pending' AND payment_status = 'unpaid' AND payment_method = 'mobile_money'
        AND created_at < (NOW() - INTERVAL ? MINUTE)`,
        [olderThanMinutes]
    );
    return rows;
};

exports.findOrdersByBuyer = async (buyerId) => {
    const [rows] = await db.query(
        `SELECT id, order_number, status, payment_status, payment_method, total_amount, created_at
        FROM orders
        WHERE buyer_id = ?
        ORDER BY created_at DESC`,
        [buyerId]
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
