const orderRepository = require("./order.repository");
const cartRepository = require("../cart/cart.repository");
const sellerRepository = require("../seller/seller.repository");
const deliveryRepository = require("../delivery/delivery.repository");
const deliveryPricingService = require("../delivery/deliveryPricing.service");
const deliveryService = require("../delivery/delivery.service");
const notificationService = require("../notification/notification.service");
const fraudService = require("../fraud/fraud.service");
const auditService = require("../audit/audit.service");
const kycService = require("../kyc/kyc.service");
const pickupPointService = require("../pickupPoint/pickupPoint.service");
const referralService = require("../referral/referral.service");
const businessService = require("../business/business.service");
const logger = require("../../utils/logger").child({ module: "order" });
const Sentry = require("../../config/sentry");
const {
    CANCELLABLE_STATUSES,
    SELLER_STATUS_TRANSITIONS,
    BUYER_PROTECTION_FEE_RATE,
    BUYER_PROTECTION_FEE_MIN,
    BUYER_PROTECTION_FEE_MAX
} = require("../../constants/orderStatus");

const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${timestamp}-${random}`;
};

// Checkout buyer-protection insurance add-on (Phase Q1): a flat
// percentage of the cart subtotal, clamped to a min/max so it's neither
// negligible on a tiny order nor disproportionate on a huge one. Applied
// to the whole cart, not per vendor - see insertOrderRow's comment in
// order.repository.js for why it only lands on the top-level order row.
const calculateBuyerProtectionFee = (subtotal) => {
    const raw = subtotal * BUYER_PROTECTION_FEE_RATE;
    return Number(Math.min(Math.max(raw, BUYER_PROTECTION_FEE_MIN), BUYER_PROTECTION_FEE_MAX).toFixed(2));
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

    // Fetch every product this cart references in one query instead of
    // one round trip per line item (Phase RF3 - was the highest-frequency
    // N+1 in the codebase, since this runs on every checkout attempt).
    const productIds = [...new Set(cart.map((item) => item.product_id))];
    const products = await cartRepository.findProductsByIds(productIds);
    const productsById = new Map(products.map((p) => [p.id, p]));

    for (const item of cart) {
        const product = productsById.get(item.product_id);

        if (!product) {
            throw new Error(`"${item.name}" is no longer available`);
        }

        if (product.is_active === 0) {
            throw new Error(`"${item.name}" is no longer available`);
        }

        if (item.quantity > product.stock) {
            throw new Error(`Only ${product.stock} of "${item.name}" left in stock`);
        }

        // B2B / bulk ordering (Phase Q7) - the best bulk tier this line
        // item's quantity qualifies for beats the regular/discount price,
        // if one exists. Available to any buyer (see migration 089's
        // comment on product_bulk_price_tiers for why this isn't gated
        // behind business-account verification), computed fresh at
        // checkout rather than trusting whatever price the cart itself
        // was showing (cart quantities can change after a product was
        // first added).
        const bulkUnitPrice = await businessService.getBulkUnitPrice(item.product_id, item.quantity);
        const unitPrice = bulkUnitPrice ?? (item.discount_price ?? item.price);
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
    const isMultiVendor = bySeller.size > 1;

    // Agent/kiosk pickup points (Phase Q5) - substitute the pickup
    // point's own address in for shippingInfo's before anything is
    // written, so every downstream consumer (delivery agent routing,
    // delivery fee calc, order confirmation email) just sees "the
    // delivery destination" without needing to know it's a pickup point
    // rather than the buyer's home. shipping_phone stays the buyer's
    // own number - that's their contact info, not the destination.
    let pickupPointId = null;
    if (shippingInfo.pickup_point_id) {
        const pickupPoint = await pickupPointService.assertActiveAndGetAddress(shippingInfo.pickup_point_id);
        pickupPointId = pickupPoint.id;
        shippingInfo = {
            ...shippingInfo,
            shipping_address: pickupPoint.address,
            shipping_city: pickupPoint.city,
            shipping_region: pickupPoint.region,
            delivery_lat: pickupPoint.latitude,
            delivery_lng: pickupPoint.longitude
        };
    }

    const wantsBuyerProtection = Boolean(shippingInfo.buyer_protection_addon);
    const buyerProtectionFee = wantsBuyerProtection ? calculateBuyerProtectionFee(totalAmount) : 0;

    // Loyalty points redemption (Phase Q7) - quoted (validated, not yet
    // deducted) here so the discount can be folded into roundedTotal;
    // actually committed (balance deducted) only after the order row
    // exists below, so a checkout that fails after this point never
    // burns points for an order that was never created.
    const pointsToRedeem = Number(shippingInfo.loyalty_points_redeemed) || 0;
    const { pointsRedeemed, discountAmount: loyaltyDiscount } = await referralService.quoteRedemption(buyerId, pointsToRedeem);

    const roundedTotal = Number((totalAmount + buyerProtectionFee - loyaltyDiscount).toFixed(2));

    // Progressive KYC (Phase Q1): a buyer's tier caps how large a single
    // order can be - see kyc.service.js#enforceOrderLimit. Checked here,
    // against the final charge total (subtotal + insurance fee), before
    // any order/payment row exists, so a blocked checkout leaves nothing
    // behind to clean up.
    await kycService.enforceOrderLimit(buyerId, roundedTotal);

    const buyerProtection = { addon: wantsBuyerProtection, fee: buyerProtectionFee };
    const loyalty = { pointsRedeemed, discountAmount: loyaltyDiscount };

    let orderId;
    let vendorCount = 1;

    if (isMultiVendor) {
        const { parentOrderId } = await orderRepository.createSplitOrder(
            buyerId,
            orderNumber,
            shippingInfo,
            Array.from(bySeller.values()),
            roundedTotal,
            buyerProtection,
            pickupPointId,
            loyalty
        );
        orderId = parentOrderId;
        vendorCount = bySeller.size;
    } else {
        orderId = await orderRepository.createOrder(
            buyerId,
            orderNumber,
            shippingInfo,
            cartItems,
            roundedTotal,
            buyerProtection,
            pickupPointId,
            loyalty
        );
    }

    // Only now that the order row genuinely exists do we actually burn
    // the points quoted above (see quoteRedemption's comment) - fire-
    // and-forget is NOT appropriate here (unlike most other post-order
    // side effects in this file), so this is awaited before continuing.
    await referralService.commitRedemption(buyerId, pointsRedeemed);

    // Affiliate attribution (Phase Q7) - fire-and-forget, resolves to a
    // no-op if no click_token was submitted or it doesn't check out (see
    // affiliate.service.js#attributeOrder). Uses the actual order total
    // (post buyer-protection-fee, post loyalty-discount) since that's
    // genuinely what NEXORA earned commission-worthy revenue on.
    require("../affiliate/affiliate.service").attributeOrder(orderId, buyerId, shippingInfo.affiliate_click_token)
        .catch((err) => logger.error({ err, orderId }, "affiliate attribution error"));

    await notificationService.notify({
        userId: buyerId,
        type: "order_placed",
        titleKey: "notifications.order.placed.title",
        messageKey: isMultiVendor ? "notifications.order.placed.messageMultiVendor" : "notifications.order.placed.messageSingle",
        messageParams: { orderNumber, vendorCount },
        relatedOrderId: orderId,
        withEmail: true,
        withWhatsApp: true
    });

    // Fire-and-forget: fraud flagging is advisory (surfaces in the admin
    // panel for review) and must never delay or fail a real checkout.
    fraudService.evaluateOrder({ id: orderId, buyer_id: buyerId, total_amount: totalAmount })
        .catch((err) => {
            logger.error({ err, orderId }, "fraud order evaluation failed");
            Sentry.captureException(err, { tags: { area: "order", stage: "fraud-evaluation" }, extra: { orderId } });
        });

    auditService.log({
        userId: buyerId,
        eventType: "order_created",
        description: `Order ${orderNumber} created`,
        metadata: { orderId, orderNumber, totalAmount: roundedTotal, isMultiVendor, vendorCount }
    });

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

        // Phase 5 (Backend N+1 Fixes & Read Replica Adoption): was N
        // sequential UPDATEs (one per child order) in a loop - now one
        // query covers every child order at once. `children` above is
        // still needed for the cancellability check right before this,
        // so that fetch stays; only the per-row update collapses.
        await orderRepository.updateOrderStatusForChildren(orderId, "cancelled");
    } else if (!CANCELLABLE_STATUSES.includes(order.status)) {
        throw new Error(`Order can no longer be cancelled (status: ${order.status})`);
    }

    await orderRepository.updateOrderStatus(orderId, "cancelled");

    await notificationService.notify({
        userId: buyerId,
        type: "order_cancelled",
        titleKey: "notifications.order.cancelled.title",
        messageKey: "notifications.order.cancelled.message",
        messageParams: { orderNumber: order.order_number },
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
        // Phase 5 (Backend N+1 Fixes & Read Replica Adoption): this used
        // to fetch every child order just to loop over them with one
        // UPDATE each - N+1 twice over (a SELECT to list children, then
        // N UPDATEs). Unlike cancelOrder above, there's no per-child
        // validation needed here (no buyer-facing cancellability check -
        // see the comment above this function), so the fetch itself was
        // pure overhead; one batched UPDATE replaces both the SELECT and
        // the loop.
        await orderRepository.updateOrderStatusForChildren(order.id, "cancelled");
    }

    await orderRepository.updateOrderStatus(order.id, "cancelled");

    await notificationService.notify({
        userId: order.buyer_id,
        type: "order_cancelled",
        titleKey: "notifications.order.cancelled.title",
        messageKey: "notifications.order.cancelledUnpaid.message",
        messageParams: { orderNumber: order.order_number },
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

    // Payment Security: same rule as getSellerOrders - an order requiring
    // upfront online payment that hasn't been verified paid yet doesn't
    // exist as far as a seller is concerned, even by direct order id.
    if (order.payment_method !== "cash_on_delivery" && order.payment_status !== "paid") {
        throw new Error("Order not found");
    }

    const items = await orderRepository.findOrderItemsBySeller(orderId, sellerId);

    // C1 (Phase 4 remediation): same "stuck wallet credit" signal as
    // getSellerOrders/findOrdersBySeller above, computed here instead of
    // in SQL since `items` (already scoped to this seller) already
    // carries wallet_credited per row - see the longer comment on
    // findOrdersBySeller for why the 10-minute grace window exists.
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const paidLongEnoughAgo = Boolean(order.updated_at) && (Date.now() - new Date(order.updated_at).getTime()) > TEN_MINUTES_MS;
    const walletCreditPending = order.payment_method !== "cash_on_delivery"
        && order.payment_status === "paid"
        && paidLongEnoughAgo
        && items.some((item) => !item.wallet_credited);

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
        wallet_credit_pending: walletCreditPending,
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

    // Payment Security: a seller must never accept/process an order that
    // requires upfront online payment until it's actually verified paid -
    // this is the enforcement point (not just a listing/detail filter),
    // since a seller could otherwise still hit this endpoint directly
    // with an order id they'd learned some other way.
    if (order.payment_method !== "cash_on_delivery" && order.payment_status !== "paid") {
        throw new Error("This order can't be accepted yet - payment hasn't been verified");
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

        const { fee: deliveryFee, distanceKm, durationMinutes, routingProvider } =
            await deliveryPricingService.calculateDeliveryFee(order);

        await orderRepository.setDeliveryMode(orderId, "own");
        await deliveryRepository.create(orderId, agentId, deliveryFee, distanceKm, durationMinutes, routingProvider);

        await notificationService.notify({
            userId: agentId,
            type: "delivery_assigned",
            titleKey: "notifications.delivery.assigned.title",
            messageKey: "notifications.delivery.assigned.message",
            messageParams: { orderNumber: order.order_number },
            relatedOrderId: orderId,
            withEmail: true
        });
    }

    // Cash on Delivery means whoever delivers it also collects and holds
    // cash on the platform's behalf - that's only safe to ask of a
    // seller's own, accountable roster agent, not an anonymous agent
    // picked up from the open platform pool. See migration 061 /
    // confirmDeliveryReceipt for the other half of this (buyer, not
    // seller, is what finalizes COD payment).
    if (newStatus === "shipped" && !agentId && order.payment_method === "cash_on_delivery") {
        throw new Error("Cash on Delivery orders must be shipped with one of your own delivery agents - assign one from your roster instead of the platform pool");
    }

    await orderRepository.updateOrderStatus(orderId, newStatus);

    // Platform pool (no specific roster agent chosen): kick off nearest-agent
    // matching. Fire-and-forget — if it can't find/reach anyone, the order
    // just sits in the manual "available for pickup" pool as a fallback.
    if (newStatus === "shipped" && !agentId) {
        deliveryService.startMatching(orderId).catch((err) => {
            logger.error({ err, orderId }, "startMatching error");
            Sentry.captureException(err, { tags: { area: "order", stage: "delivery-matching" }, extra: { orderId } });
        });
    }

    await notificationService.notify({
        userId: order.buyer_id,
        type: "order_status_update",
        titleKey: "notifications.order.statusUpdated.title",
        messageKey: "notifications.order.statusUpdated.message",
        messageParams: { orderNumber: order.order_number, status: newStatus },
        relatedOrderId: orderId,
        withEmail: true,
        withWhatsApp: true
    });
};
