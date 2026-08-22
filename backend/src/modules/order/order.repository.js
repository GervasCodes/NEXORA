const db = require("../../config/db");

// Shared by createOrder/createSplitOrder below: insert one `orders` row
// (optionally as a child of `parentOrderId`) and return its insertId.
// buyerProtectionAddon/Fee (Phase Q1) only apply to the top-level row a
// buyer actually pays for (standalone order, or the parent of a split
// cart) - child orders default to 0/false since the guarantee covers the
// whole cart, not a single vendor's slice of it.
const insertOrderRow = async (connection, { buyerId, parentOrderId, isParent, orderNumber, shippingInfo, totalAmount, buyerProtectionAddon = false, buyerProtectionFee = 0, pickupPointId = null, loyaltyPointsRedeemed = 0, loyaltyDiscountAmount = 0 }) => {
    const [orderResult] = await connection.query(
        `INSERT INTO orders
        (order_number, buyer_id, parent_order_id, is_parent, status, payment_status, payment_method,
         shipping_address, shipping_city, shipping_region, shipping_phone, pickup_point_id,
         delivery_lat, delivery_lng, total_amount, buyer_protection_addon, buyer_protection_fee,
         loyalty_points_redeemed, loyalty_discount_amount)
        VALUES (?, ?, ?, ?, 'pending', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            pickupPointId,
            shippingInfo.delivery_lat ?? null,
            shippingInfo.delivery_lng ?? null,
            totalAmount,
            buyerProtectionAddon ? 1 : 0,
            buyerProtectionFee,
            loyaltyPointsRedeemed,
            loyaltyDiscountAmount
        ]
    );

    return orderResult.insertId;
};

// Insert this order's line items + decrement stock. Throws (and lets the
// caller roll back) if any item no longer has enough stock.
//
// Batched (Phase RF3): previously this ran 2 queries per line item (an
// INSERT then an UPDATE) - a 10-item cart was 20 sequential round trips
// inside one checkout transaction. Product IDs within a single cart are
// always distinct (cart_items has a UNIQUE(user_id, product_id)
// constraint), so a single multi-row INSERT plus a single CASE-based
// UPDATE covers every line item safely in 2 queries total. The extra
// SELECT below only runs on the (rare) insufficient-stock path, to work
// out which item's error message to raise - same message the old
// per-item loop gave.
const insertOrderItems = async (connection, orderId, cartItems) => {
    if (!cartItems.length) {
        return;
    }

    const insertValues = cartItems.map((item) => [
        orderId, item.product_id, item.seller_id, item.quantity, item.unit_price, item.subtotal
    ]);

    await connection.query(
        `INSERT INTO order_items
        (order_id, product_id, seller_id, quantity, unit_price, subtotal)
        VALUES ?`,
        [insertValues]
    );

    const productIds = cartItems.map((item) => item.product_id);
    const caseClauses = cartItems.map(() => "WHEN ? THEN stock - ?").join(" ");
    const caseParams = cartItems.flatMap((item) => [item.product_id, item.quantity]);
    const guardClauses = cartItems.map(() => "(id = ? AND stock >= ?)").join(" OR ");
    const guardParams = cartItems.flatMap((item) => [item.product_id, item.quantity]);

    const [stockResult] = await connection.query(
        `UPDATE products
        SET stock = CASE id ${caseClauses} END
        WHERE id IN (?) AND (${guardClauses})`,
        [...caseParams, productIds, ...guardParams]
    );

    if (stockResult.affectedRows < cartItems.length) {
        const [rows] = await connection.query(
            "SELECT id, stock FROM products WHERE id IN (?)",
            [productIds]
        );
        const stockById = new Map(rows.map((row) => [row.id, row.stock]));

        for (const item of cartItems) {
            const currentStock = stockById.get(item.product_id) ?? 0;

            if (currentStock < item.quantity) {
                throw new Error(`"${item.name}" no longer has enough stock`);
            }
        }
    }
};

// Create a single (non-split) order + its items + decrement stock, all in
// one transaction. cartItems: rows from cart_items joined with product
// price/stock (see order.service.js). Used for single-vendor checkouts.
exports.createOrder = async (buyerId, orderNumber, shippingInfo, cartItems, totalAmount, buyerProtection = {}, pickupPointId = null, loyalty = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const orderId = await insertOrderRow(connection, {
            buyerId, parentOrderId: null, isParent: false, orderNumber, shippingInfo, totalAmount,
            buyerProtectionAddon: buyerProtection.addon, buyerProtectionFee: buyerProtection.fee, pickupPointId,
            loyaltyPointsRedeemed: loyalty.pointsRedeemed, loyaltyDiscountAmount: loyalty.discountAmount
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
exports.createSplitOrder = async (buyerId, parentOrderNumber, shippingInfo, sellerGroups, totalAmount, buyerProtection = {}, pickupPointId = null, loyalty = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const parentOrderId = await insertOrderRow(connection, {
            buyerId, parentOrderId: null, isParent: true, orderNumber: parentOrderNumber, shippingInfo, totalAmount,
            buyerProtectionAddon: buyerProtection.addon, buyerProtectionFee: buyerProtection.fee, pickupPointId,
            loyaltyPointsRedeemed: loyalty.pointsRedeemed, loyaltyDiscountAmount: loyalty.discountAmount
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
                totalAmount: group.subtotal,
                pickupPointId
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

// Buyer confirms they actually received the order - separate from
// `status` (which just means "seller/agent marked it handed off"). See
// migration 061 and payment.service.js#confirmDeliveryReceipt.
exports.markBuyerConfirmed = async (orderId) => {
    await db.query(
        "UPDATE orders SET buyer_confirmed_at = NOW() WHERE id = ?",
        [orderId]
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

// Phase 5 (Backend N+1 Fixes & Read Replica Adoption): replaces what
// order.service.js#cancelOrder and #autoCancelStaleOrder used to do with
// one `UPDATE ... WHERE parent_order_id = ?` per child order in a loop -
// N round trips for an N-vendor cart. Every child order in a cancellation
// always moves to the same target status together, so this is exactly
// the same "N identical per-row UPDATEs -> one batched UPDATE" shape as
// updatePaymentStatusForChildren above; mirrors it rather than using a
// WHERE id IN (?) + collected id array, since parent_order_id already
// scopes exactly the right rows without the caller needing to fetch
// child ids first at all.
exports.updateOrderStatusForChildren = async (parentOrderId, status) => {
    await db.query(
        "UPDATE orders SET status = ? WHERE parent_order_id = ?",
        [status, parentOrderId]
    );
};

// Orders that contain at least one item belonging to this seller.
// Payment Security: a seller must not see (or be able to accept/process)
// an order that requires upfront online payment until that payment is
// actually verified - only Cash on Delivery orders are legitimately
// visible before payment_status flips to 'paid' (COD is only marked paid
// after the buyer confirms receipt, see payment.service.js#confirmDeliveryReceipt).
exports.findOrdersBySeller = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
            AND (o.payment_method = 'cash_on_delivery' OR o.payment_status = 'paid')
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
