const orderRepository = require("./order.repository");
const cartRepository = require("../cart/cart.repository");
const sellerRepository = require("../seller/seller.repository");
const deliveryRepository = require("../delivery/delivery.repository");
const deliveryService = require("../delivery/delivery.service");
const notificationService = require("../notification/notification.service");
const settingsService = require("../settings/settings.service");
const fraudService = require("../fraud/fraud.service");
const {
    CANCELLABLE_STATUSES,
    SELLER_STATUS_TRANSITIONS
} = require("../../constants/orderStatus");

const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${timestamp}-${random}`;
};

// Checkout: turn the buyer's current cart into an order. A cart with
// items from a single vendor becomes one standalone order (unchanged
// behavior). A cart spanning multiple vendors becomes one parent order
// (buyer-facing - payment, shipping, combined total) plus one child
// order per vendor (that vendor's items, own status/delivery).
exports.checkout = async (buyerId, shippingInfo) => {
    const cart = await cartRepository.getCartByUser(buyerId);

    if (!cart.length) {
        throw new Error("Your cart is empty");
    }

    const cartItems = [];
    const bySeller = new Map(); // seller_id -> { items: [], subtotal: 0 }
    let totalAmount = 0;

    for (const item of cart) {
        const product = await cartRepository.findProductById(item.product_id);

        if (!product) {
            throw new Error(`"${item.name}" is no longer available`);
        }

        if (product.is_active === 0) {
            throw new Error(`"${item.name}" is no longer available`);
        }

        if (item.quantity > product.stock) {
            throw new Error(`Only ${product.stock} of "${item.name}" left in stock`);
        }

        const unitPrice = item.discount_price ?? item.price;
        const subtotal = Number((unitPrice * item.quantity).toFixed(2));

        const cartItem = {
            product_id: item.product_id,
            seller_id: item.seller_id,
            name: item.name,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal
        };

        cartItems.push(cartItem);
        totalAmount += subtotal;

        const group = bySeller.get(item.seller_id) || { sellerId: item.seller_id, items: [], subtotal: 0 };
        group.items.push(cartItem);
        group.subtotal = Number((group.subtotal + subtotal).toFixed(2));
        bySeller.set(item.seller_id, group);
    }

    const orderNumber = generateOrderNumber();
    const roundedTotal = Number(totalAmount.toFixed(2));
    const isMultiVendor = bySeller.size > 1;

    let orderId;
    let vendorCount = 1;

    if (isMultiVendor) {
        const { parentOrderId } = await orderRepository.createSplitOrder(
            buyerId,
            orderNumber,
            shippingInfo,
            Array.from(bySeller.values()),
            roundedTotal
        );
        orderId = parentOrderId;
        vendorCount = bySeller.size;
    } else {
        orderId = await orderRepository.createOrder(
            buyerId,
            orderNumber,
            shippingInfo,
            cartItems,
            roundedTotal
        );
    }

    await notificationService.notify({
        userId: buyerId,
        type: "order_placed",
        title: "Order placed",
        message: isMultiVendor
            ? `Your order ${orderNumber} (${vendorCount} vendors) has been placed successfully.`
            : `Your order ${orderNumber} has been placed successfully.`,
        relatedOrderId: orderId,
        withEmail: true
    });

    // Fire-and-forget: fraud flagging is advisory (surfaces in the admin
    // panel for review) and must never delay or fail a real checkout.
    fraudService.evaluateOrder({ id: orderId, buyer_id: buyerId, total_amount: totalAmount })
        .catch((err) => console.error("[fraud] order evaluation failed:", err.message));

    // Lazy require to avoid a circular dependency (socket module doesn't
    // depend back on order, but this keeps the pattern consistent with
    // how delivery.service/chat.service reach the socket layer).
    require("../../socket/socket").emitToAdmins("admin:stats_changed", { reason: "order_placed" });

    return {
        orderId,
        orderNumber,
        totalAmount: roundedTotal,
        isMultiVendor,
        vendorCount
    };
};

exports.getMyOrders = async (buyerId) => {
    return orderRepository.findOrdersByBuyer(buyerId);
};

exports.getOrderDetail = async (orderId, buyerId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    if (order.is_parent) {
        const children = await orderRepository.findChildOrders(orderId);

        const childrenWithItems = await Promise.all(
            children.map(async (child) => ({
                ...child,
                items: await orderRepository.findOrderItems(child.id)
            }))
        );

        return { ...order, children: childrenWithItems };
    }

    const items = await orderRepository.findOrderItems(orderId);

    return { ...order, items };
};

exports.cancelOrder = async (orderId, buyerId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }

    // A child order is cancelled as part of its parent, not on its own -
    // otherwise the buyer's single payment for the whole cart would no
    // longer match what's actually being fulfilled.
    if (order.parent_order_id) {
        throw new Error("Cancel the full order instead of a single vendor's part of it");
    }

    if (order.is_parent) {
        const children = await orderRepository.findChildOrders(orderId);
        const nonCancellable = children.find((child) => !CANCELLABLE_STATUSES.includes(child.status));

        if (nonCancellable) {
            throw new Error(
                `Order can no longer be cancelled (vendor order ${nonCancellable.order_number} is "${nonCancellable.status}")`
            );
        }

        for (const child of children) {
            await orderRepository.updateOrderStatus(child.id, "cancelled");
        }
    } else if (!CANCELLABLE_STATUSES.includes(order.status)) {
        throw new Error(`Order can no longer be cancelled (status: ${order.status})`);
    }

    await orderRepository.updateOrderStatus(orderId, "cancelled");

    await notificationService.notify({
        userId: buyerId,
        type: "order_cancelled",
        title: "Order cancelled",
        message: `Your order ${order.order_number} has been cancelled.`,
        relatedOrderId: orderId,
        withEmail: true
    });
};

// System-initiated (not buyer-initiated) - called by the staleOrders
// background job. Unlike cancelOrder above, there's no buyer ownership
// check since there's no requesting user; the query that selects
// candidates (findStalePendingMobileMoneyOrders) is what scopes this.
exports.autoCancelStaleOrder = async (order) => {
    if (order.is_parent) {
        const children = await orderRepository.findChildOrders(order.id);
        for (const child of children) {
            await orderRepository.updateOrderStatus(child.id, "cancelled");
        }
    }

    await orderRepository.updateOrderStatus(order.id, "cancelled");

    await notificationService.notify({
        userId: order.buyer_id,
        type: "order_cancelled",
        title: "Order cancelled",
        message: `Your order ${order.order_number} was cancelled because payment was never completed. Feel free to place it again.`,
        relatedOrderId: order.id,
        withEmail: true
    });
};

exports.getSellerOrders = async (sellerId) => {
    return orderRepository.findOrdersBySeller(sellerId);
};

exports.getSellerOrderDetail = async (orderId, sellerId) => {
    const order = await orderRepository.findOrderById(orderId);

    const ownsItem = order && await orderRepository.sellerHasItemInOrder(orderId, sellerId);

    if (!order || !ownsItem) {
        throw new Error("Order not found");
    }

    const items = await orderRepository.findOrderItemsBySeller(orderId, sellerId);

    // Only expose what a seller needs - not the buyer's payment method internals
    return {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        shipping_address: order.shipping_address,
        shipping_city: order.shipping_city,
        shipping_region: order.shipping_region,
        shipping_phone: order.shipping_phone,
        created_at: order.created_at,
        items
    };
};

exports.updateOrderStatusBySeller = async (orderId, sellerId, newStatus, agentId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    const ownsItem = await orderRepository.sellerHasItemInOrder(orderId, sellerId);

    if (!ownsItem) {
        throw new Error("Order not found");
    }

    const allowedNext = SELLER_STATUS_TRANSITIONS[order.status] || [];

    if (!allowedNext.includes(newStatus)) {
        throw new Error(
            `Cannot move order from "${order.status}" to "${newStatus}"`
        );
    }

    // Moving to "shipped" is the point where a seller can hand this off to
    // one of their own hired agents instead of the open platform pool.
    if (newStatus === "shipped" && agentId) {
        const isInRoster = await sellerRepository.isInRoster(sellerId, agentId);

        if (!isInRoster) {
            throw new Error("That agent isn't in your delivery roster");
        }

        const existingDelivery = await deliveryRepository.findByOrderId(orderId);
        if (existingDelivery) {
            throw new Error("This order already has a delivery assigned");
        }

        const deliveryFee = await settingsService.getRiderDeliveryFee();

        await orderRepository.setDeliveryMode(orderId, "own");
        await deliveryRepository.create(orderId, agentId, deliveryFee);

        await notificationService.notify({
            userId: agentId,
            type: "delivery_assigned",
            title: "New delivery assigned to you",
            message: `You've been assigned to deliver order ${order.order_number}.`,
            relatedOrderId: orderId,
            withEmail: true
        });
    }

    await orderRepository.updateOrderStatus(orderId, newStatus);

    // Platform pool (no specific roster agent chosen): kick off nearest-agent
    // matching. Fire-and-forget — if it can't find/reach anyone, the order
    // just sits in the manual "available for pickup" pool as a fallback.
    if (newStatus === "shipped" && !agentId) {
        deliveryService.startMatching(orderId).catch((err) =>
            console.error("startMatching error:", err)
        );
    }

    await notificationService.notify({
        userId: order.buyer_id,
        type: "order_status_update",
        title: "Order status updated",
        message: `Your order ${order.order_number} is now "${newStatus}".`,
        relatedOrderId: orderId,
        withEmail: true
    });
};
