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
const buyerAddressService = require("../buyerAddress/buyerAddress.service");
const couponService = require("../coupon/coupon.service");
const paymentRepository = require("../payment/payment.repository");
const refundService = require("../refund/refund.service");
const refundCapService = require("../refund/refundCap.service");
const walletService = require("../wallet/wallet.service");
const logger = require("../../utils/logger").child({ module: "order" });
const Sentry = require("../../config/sentry");
const {
    CANCELLABLE_STATUSES,
    SELLER_STATUS_TRANSITIONS,
    BUYER_PROTECTION_FEE_RATE,
    BUYER_PROTECTION_FEE_MIN,
    BUYER_PROTECTION_FEE_MAX,
    DEFAULT_PREORDER_DEPOSIT_PERCENT,
    DEFAULT_PREORDER_LEAD_TIME_DAYS,
    MIN_PAYABLE_ORDER_AMOUNT
} = require("../../constants/orderStatus");

const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${timestamp}-${random}`;
};

// Turns an item name + how many line items an order has into the
// `{itemSummary}` notification content templates interpolate (Phase 6,
// UI/UX remediation) - "order placed"/"cancelled"/"status updated"
// previously only ever named the order number, never what was actually
// in it. Returns null when there's no item to name (checkout never hits
// this - a single-vendor order always has at least one item - but the
// post-checkout lifecycle notifications look this up via
// orderRepository.getPrimaryItemSummary, which returns null for a
// multi-vendor parent order), so callers can fall back to the existing
// order-number-only message key exactly as before this existed.
const buildItemSummary = (itemName, itemCount) => {
    if (!itemName) return null;
    return itemCount > 1 ? `${itemName} +${itemCount - 1} more` : itemName;
};

// Delivery proof handover code notices (Phase 5, P0) - see the call
// site in checkout() above. One SMS + one WhatsApp per deliverable
// order, each reading back that order's own delivery_handover_code
// (generated in insertOrderRow, not returned from createOrder/
// createSplitOrder, so re-fetched here rather than threading a new
// return shape through three call sites for this one notification).
const sendHandoverCodeNotices = async (orderIds, buyerId, shippingPhone) => {
    const smsProvider = require("../sms/providers/sms.provider");

    for (const id of orderIds) {
        const order = await orderRepository.findOrderById(id);
        if (!order?.delivery_handover_code) continue;

        await notificationService.notify({
            userId: buyerId,
            type: "delivery_handover_code",
            titleKey: "notifications.order.handoverCode.title",
            messageKey: "notifications.order.handoverCode.message",
            messageParams: { orderNumber: order.order_number, code: order.delivery_handover_code },
            relatedOrderId: id,
            withWhatsApp: true
        }).catch((err) => logger.error({ err, orderId: id }, "handover code WhatsApp/in-app notice error"));

        if (shippingPhone && smsProvider.isConfigured()) {
            const body = `Your NEXORA order ${order.order_number} delivery code is ${order.delivery_handover_code}. Give this to the rider on delivery.`;
            await smsProvider.sendText(shippingPhone, body)
                .catch((err) => logger.error({ err, orderId: id }, "handover code SMS send error"));
        }
    }
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

    // Variants (continuation, UI/UX remediation) - same batched
    // fetch shape as products above, only for the line items that
    // actually have one (variant_id is the 0 sentinel otherwise - see
    // cart.repository.js's comment).
    const variantIds = [...new Set(cart.filter((item) => item.variant_id).map((item) => item.variant_id))];
    const variants = variantIds.length ? await cartRepository.findVariantsByIds(variantIds) : [];
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    // Batch bulk-tier pricing (Phase 3) - was one businessService call per
    // cart line item inside the loop below (an N+1 on every checkout, same
    // shape as the product/variant batching above already fixed). One
    // query up front covers every distinct product in the cart instead.
    const bulkUnitPriceByProduct = await businessService.getBulkUnitPrices(productIds, cart);

    // Seller-eligibility check (Phase 3) - batched once for every distinct
    // seller in the cart, not per line item. A seller whose account is
    // suspended or deleted between adding to cart and checking out must
    // not be checked out from, even though their products technically
    // still exist - see cartRepository.findActiveSellerIds's comment.
    const cartSellerIds = [...new Set(cart.map((item) => item.seller_id))];
    const activeSellerIds = new Set(await cartRepository.findActiveSellerIds(cartSellerIds));

    for (const item of cart) {
        const product = productsById.get(item.product_id);

        if (!product) {
            throw new Error(`"${item.name}" is no longer available`);
        }

        if (product.is_active === 0) {
            throw new Error(`"${item.name}" is no longer available`);
        }

        if (!activeSellerIds.has(item.seller_id)) {
            throw new Error(`"${item.name}" is no longer available - the seller's store isn't currently active`);
        }

        const variant = item.variant_id ? variantsById.get(item.variant_id) : null;
        if (item.variant_id && !variant) {
            throw new Error(`"${item.name}" - the selected option is no longer available`);
        }

        const availableStock = variant ? variant.stock : product.stock;
        if (item.quantity > availableStock) {
            throw new Error(`Only ${availableStock} of "${item.name}"${variant ? " (selected option)" : ""} left in stock`);
        }

        // B2B / bulk ordering the best bulk tier this line
        // item's quantity qualifies for beats the regular/discount price,
        // if one exists. Available to any buyer (see migration 089's
        // comment on product_bulk_price_tiers for why this isn't gated
        // behind business-account verification), computed fresh at
        // checkout rather than trusting whatever price the cart itself
        // was showing (cart quantities can change after a product was
        // first added). A variant's price_delta always applies on top,
        // whether the base price came from a bulk tier or the regular/
        // discount price - it's an adjustment for the specific
        // combination selected, not an alternative to bulk pricing.
        const bulkUnitPrice = bulkUnitPriceByProduct.get(item.product_id, item.quantity);
        const basePrice = bulkUnitPrice ?? (item.discount_price ?? item.price);
        const unitPrice = variant ? Number((basePrice + Number(variant.price_delta || 0)).toFixed(2)) : basePrice;
        const subtotal = Number((unitPrice * item.quantity).toFixed(2));

        const cartItem = {
            cart_item_id: item.cart_item_id,
            product_id: item.product_id,
            variant_id: variant ? variant.id : null,
            variant_label: variant ? Object.entries(variant.options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
            seller_id: item.seller_id,
            name: item.name,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal,
            // Pre-order / made-to-order (Phase 8) - carried on the cart
            // item (not just looked up again later) so the deposit/mixed-
            // cart checks below don't need to re-touch productsById.
            is_preorder: Boolean(product.is_preorder),
            preorder_lead_time_days: product.preorder_lead_time_days || null
        };

        cartItems.push(cartItem);
        totalAmount += subtotal;

        const group = bySeller.get(item.seller_id) || { sellerId: item.seller_id, items: [], subtotal: 0 };
        group.items.push(cartItem);
        group.subtotal = Number((group.subtotal + subtotal).toFixed(2));
        bySeller.set(item.seller_id, group);
    }

    // Commission at checkout (Phase 2). Each item's platform commission is
    // now snapshotted onto order_items right here, at the rate that applies
    // AT CHECKOUT, and wallet.service.js#creditSellersForOrder uses that
    // stored rate unchanged when the payment is confirmed - a seller
    // upgrading/downgrading plans (or an admin changing the commission
    // rate) between checkout and payment confirmation can no longer
    // silently change what a buyer's already-placed order actually earns
    // the seller. One lookup per distinct seller, same reasoning as
    // creditSellersForOrder's own commissionRateBySeller map.
    const subscriptionService = require("../subscription/subscription.service");
    const distinctSellerIds = [...new Set(cartItems.map((item) => item.seller_id))];
    const commissionRateBySeller = new Map(
        await Promise.all(
            distinctSellerIds.map(async (sellerId) => [sellerId, await subscriptionService.getEffectiveCommissionRate(sellerId)])
        )
    );
    for (const item of cartItems) {
        const commissionRate = commissionRateBySeller.get(item.seller_id);
        const commissionAmount = Number((item.subtotal * (commissionRate / 100)).toFixed(2));
        item.commission_rate = commissionRate;
        item.commission_amount = commissionAmount;
        item.seller_net_amount = Number((item.subtotal - commissionAmount).toFixed(2));
    }

    const orderNumber = generateOrderNumber();
    const isMultiVendor = bySeller.size > 1;

    // Agent/kiosk pickup points  - substitute the pickup
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

    // Saved address book ( UI/UX remediation) - same idea as the
    // pickup-point substitution just above: re-fetch the authoritative
    // saved address server-side (rather than trusting whatever text the
    // client copied into shipping_address) so an address the buyer no
    // longer owns, or already deleted, can't be used. Only applies when
    // no pickup point was chosen - pickup point and saved home address
    // are mutually exclusive delivery destinations, and pickup already
    // won above if both were somehow submitted.
    let buyerAddressId = null;
    if (!pickupPointId && shippingInfo.address_id) {
        const savedAddress = await buyerAddressService.assertOwnedAndGet(shippingInfo.address_id, buyerId);
        buyerAddressId = savedAddress.id;
        shippingInfo = {
            ...shippingInfo,
            shipping_address: savedAddress.address,
            shipping_city: savedAddress.city,
            shipping_region: savedAddress.region,
            shipping_phone: savedAddress.phone,
            delivery_lat: savedAddress.latitude,
            delivery_lng: savedAddress.longitude
        };
    }

    const wantsBuyerProtection = Boolean(shippingInfo.buyer_protection_addon);
    const buyerProtectionFee = wantsBuyerProtection ? calculateBuyerProtectionFee(totalAmount) : 0;

    // Loyalty points redemption  - quoted (validated, not yet
    // deducted) here so the discount can be folded into roundedTotal;
    // actually committed (balance deducted) only after the order row
    // exists below, so a checkout that fails after this point never
    // burns points for an order that was never created.
    const pointsToRedeem = Number(shippingInfo.loyalty_points_redeemed) || 0;
    const { pointsRedeemed, discountAmount: loyaltyDiscount } = await referralService.quoteRedemption(buyerId, pointsToRedeem);

    // Coupon code (UI/UX remediation) - same quote-then-commit
    // sequencing as loyalty points above, for the same reason: a
    // checkout that fails after this point should never burn the code's
    // one-per-buyer redemption. Quoted against the pre-discount cart
    // subtotal (totalAmount), not the buyer-protection-inclusive total,
    // so a coupon's min_order_amount reflects what's actually in the
    // cart rather than an add-on the buyer may not even have selected.
    const { coupon, discountAmount: couponDiscount } = await couponService.quote(
        shippingInfo.coupon_code,
        buyerId,
        totalAmount
    );

    // Loyalty cap (Phase 3, P0) - previously nothing stopped
    // couponDiscount + loyaltyDiscount from exceeding what's left to
    // discount, which could drive the charged total to zero or negative
    // (a buyer with enough points plus a generous coupon could check out
    // for free, or for a "negative" amount the payment providers would
    // reject in stranger ways). The coupon is applied first (its own cap
    // in coupon.service.js#quote already keeps it from exceeding the
    // pre-fee subtotal on its own); loyalty points are capped against
    // whatever's left after that, down to MIN_PAYABLE_ORDER_AMOUNT, and
    // the actual points redeemed are rounded DOWN to match - a buyer is
    // never charged for points beyond what the cap actually let them use.
    const preLoyaltyTotal = Number((totalAmount + buyerProtectionFee - couponDiscount).toFixed(2));
    const maxLoyaltyDiscount = Math.max(0, Number((preLoyaltyTotal - MIN_PAYABLE_ORDER_AMOUNT).toFixed(2)));

    let cappedPointsRedeemed = pointsRedeemed;
    let cappedLoyaltyDiscount = loyaltyDiscount;
    if (cappedLoyaltyDiscount > maxLoyaltyDiscount) {
        cappedPointsRedeemed = Math.floor(maxLoyaltyDiscount / referralService.POINT_VALUE_TZS);
        cappedLoyaltyDiscount = Number((cappedPointsRedeemed * referralService.POINT_VALUE_TZS).toFixed(2));
    }

    const roundedTotal = Number((preLoyaltyTotal - cappedLoyaltyDiscount).toFixed(2));

    if (roundedTotal <= 0) {
        throw new Error("This order's total can't be reduced to zero or below - please use fewer points or remove the coupon and try again");
    }

    // Progressive KYC  a buyer's tier caps how large a single
    // order can be - see kyc.service.js#enforceOrderLimit. Checked here,
    // against the final charge total (subtotal + insurance fee), before
    // any order/payment row exists, so a blocked checkout leaves nothing
    // behind to clean up.
    await kycService.enforceOrderLimit(buyerId, roundedTotal);

    // Cash on Delivery (Phase 2) - COD has no payment confirmation at all
    // until the cash is actually handed over, so it gets its own stricter
    // checks on top of the general order-value cap above: a lower per-order
    // cap, a ceiling on how many COD orders a buyer can have in flight at
    // once, and a hard block for buyers with too many refused deliveries.
    if (shippingInfo.payment_method === "cash_on_delivery") {
        await kycService.enforceCodNotBlocked(buyerId);
        await kycService.enforceCodOrderLimit(buyerId, roundedTotal);
        await kycService.enforceUnpaidCodLimit(buyerId);
    }

    const buyerProtection = { addon: wantsBuyerProtection, fee: buyerProtectionFee };
    const loyalty = { pointsRedeemed: cappedPointsRedeemed, discountAmount: cappedLoyaltyDiscount };
    const couponInfo = { couponId: coupon?.id ?? null, discountAmount: couponDiscount };

    // Pre-order / made-to-order (Phase 8). Scope deliberately narrow for
    // v1: a pre-order cart must be single-vendor and every line item in
    // it must itself be a pre-order product - no mixing pre-order with
    // regular items, and no pre-order in a multi-vendor split cart. Both
    // would need the deposit/balance split to somehow propagate across
    // parent/child orders, which is a substantially harder problem than
    // this phase's roadmap entry calls for; a buyer with a mixed cart is
    // asked to check out the pre-order item(s) separately instead.
    const preorderItemCount = cartItems.filter((item) => item.is_preorder).length;
    const cartIsPreorder = preorderItemCount > 0;

    if (cartIsPreorder && (isMultiVendor || preorderItemCount !== cartItems.length)) {
        throw new Error(
            "Made-to-order items can't be checked out together with regular items or items from other sellers - please order them separately"
        );
    }

    // Cash on Delivery has no upfront charge to collect a deposit through
    // - the whole point of COD is the agent collects cash on handover,
    // which doesn't fit "pay part now, pay the rest once it's made".
    if (cartIsPreorder && shippingInfo.payment_method === "cash_on_delivery") {
        throw new Error("Made-to-order items require an online payment method for the deposit - Cash on Delivery isn't available for these items");
    }

    let preorder = null;

    if (cartIsPreorder) {
        const seller = await sellerRepository.findByUserId(cartItems[0].seller_id);

        if (!seller || !seller.accepts_preorders) {
            throw new Error("This store's made-to-order items are currently unavailable for pre-order checkout");
        }

        const depositPercent = Number(seller.preorder_deposit_percent) || DEFAULT_PREORDER_DEPOSIT_PERCENT;
        const leadTimeDays = Math.max(
            ...cartItems.map((item) => item.preorder_lead_time_days || seller.preorder_default_lead_time_days || DEFAULT_PREORDER_LEAD_TIME_DAYS)
        );

        const depositAmount = Number((roundedTotal * (depositPercent / 100)).toFixed(2));
        const balanceAmount = Number((roundedTotal - depositAmount).toFixed(2));

        const readyBy = new Date();
        readyBy.setDate(readyBy.getDate() + leadTimeDays);

        preorder = {
            leadTimeDays,
            readyBy: readyBy.toISOString().slice(0, 10),
            depositAmount,
            balanceAmount
        };
    }

    let orderId;
    let vendorCount = 1;
    let deliverableOrderIds = [];

    if (isMultiVendor) {
        const { parentOrderId, childOrders } = await orderRepository.createSplitOrder(
            buyerId,
            orderNumber,
            shippingInfo,
            Array.from(bySeller.values()),
            roundedTotal,
            buyerProtection,
            pickupPointId,
            loyalty,
            buyerAddressId,
            couponInfo
        );
        orderId = parentOrderId;
        vendorCount = bySeller.size;
        // Each vendor's child order ships (and gets delivered)
        // independently, so the handover code that actually matters is
        // each child's, not the parent row's unused one.
        deliverableOrderIds = childOrders.map((c) => c.orderId);
    } else {
        orderId = await orderRepository.createOrder(
            buyerId,
            orderNumber,
            shippingInfo,
            cartItems,
            roundedTotal,
            buyerProtection,
            pickupPointId,
            loyalty,
            buyerAddressId,
            couponInfo,
            preorder
        );
        deliverableOrderIds = [orderId];
    }

    // Coupon/points integrity (Phase 3, P0): both redemptions are now
    // committed INSIDE createOrder/createSplitOrder's own transaction (see
    // order.repository.js#commitDiscountRedemptions), not here as a
    // separate post-creation step - a checkout that fails partway through
    // the order-creation transaction now rolls the redemption back along
    // with the order itself, instead of having already burned the buyer's
    // code/points for an order that was never actually placed.

    // Affiliate attribution fire-and-forget, resolves to a
    // no-op if no click_token was submitted or it doesn't check out (see
    // affiliate.service.js#attributeOrder). Uses the actual order total
    // The conversion is only recorded as pending here; commission is on the
    // goods subtotal (not fees) and is paid after delivery and the return window.
    require("../affiliate/affiliate.service").attributeOrder(orderId, buyerId, shippingInfo.affiliate_click_token)
        .catch((err) => logger.error({ err, orderId }, "affiliate attribution error"));

    await notificationService.notify({
        userId: buyerId,
        type: "order_placed",
        titleKey: "notifications.order.placed.title",
        messageKey: isMultiVendor ? "notifications.order.placed.messageMultiVendor" : "notifications.order.placed.messageSingle",
        // itemSummary only matters to messageSingle (see its template) -
        // harmless to always compute it, since cartItems is this whole
        // order's item list in the single-vendor case being named here.
        messageParams: { orderNumber, vendorCount, itemSummary: buildItemSummary(cartItems[0]?.name, cartItems.length) },
        relatedOrderId: orderId,
        withEmail: true,
        withWhatsApp: true
    });

    // Delivery proof handover code (Phase 5, P0) - told to the buyer
    // right away by SMS and WhatsApp (in-app notify's withWhatsApp leg
    // plus a direct SMS, since this one specifically needs to reach a
    // phone even for a buyer who doesn't have WhatsApp configured) so
    // they have it in hand well before a rider arrives. Sent once per
    // deliverable order - a split cart has one code per vendor, since
    // each child order is delivered independently by its own rider.
    // Best-effort: never block checkout on an SMS/WhatsApp send failing.
    sendHandoverCodeNotices(deliverableOrderIds, buyerId, shippingInfo.shipping_phone)
        .catch((err) => logger.error({ err, orderId }, "handover code notice error"));

    // Fire-and-forget: fraud flagging is advisory (surfaces in the admin
    // panel for review) and must never delay or fail a real checkout.
    // Phase 3: evaluated against what the buyer is actually being charged
    // (post buyer-protection-fee, post coupon/loyalty discount), not the
    // pre-discount cart subtotal - a heavily-discounted order and its
    // full-price equivalent are very different fraud signals.
    fraudService.evaluateOrder({ id: orderId, buyer_id: buyerId, total_amount: roundedTotal })
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
        vendorCount,
        couponDiscount
    };
};

exports.getMyOrders = async (buyerId, query = {}) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

    const { orders, total } = await orderRepository.findOrdersByBuyer(buyerId, {
        status: query.status || null,
        from: query.from || null,
        to: query.to || null,
        q: query.q || null,
        sort: query.sort || null,
        page,
        limit
    });

    return {
        orders,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
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

// Cancel a paid order (Phase 3, P0). Shared by cancelOrder (buyer-
// initiated, below) and autoCancelStaleOrder (system-initiated) - called
// only AFTER the order's status has actually flipped to cancelled this
// call (not a race loser - see the conditional UPDATEs in
// order.repository.js), so it never runs twice for the same order.
// Reverses whatever financial state the order had accumulated:
//   - Loyalty points redeemed at checkout are given back.
//   - A redeemed coupon is freed up for the buyer to use again.
//   - If payment had reached paid/deposit_paid, the seller(s)' already-
//     credited earnings are reversed and the buyer is automatically
//     refunded what they actually paid (the deposit only, for a pre-order
//     that never reached full payment).
//   - Any in-flight delivery offer/assignment is called off.
// Best-effort past the status flip itself: a failure in any one step here
// is logged/Sentry-captured and does NOT throw back to the caller - the
// order is genuinely cancelled either way, and refund.service.js's own
// retry + admin-queue machinery (failed/manual_required status, visible
// on the refunds dashboard) is exactly what exists to recover from a
// refund-step failure without ever blocking the cancellation on it.
const reverseCancelledOrderEffects = async (order) => {
    // Loyalty points and a coupon are only ever recorded against the
    // top-level order row (parent for a split cart, or the order itself
    // for a standalone one - see order.repository.js#createSplitOrder),
    // so these two only need to run once regardless of is_parent.
    if (order.loyalty_points_redeemed > 0) {
        await referralService.reverseRedemption(order.buyer_id, order.loyalty_points_redeemed, order.id)
            .catch((err) => {
                logger.error({ err, orderId: order.id }, "cancel: loyalty points reversal error");
                Sentry.captureException(err, { tags: { area: "order", stage: "cancel-loyalty-reversal" }, extra: { orderId: order.id } });
            });
    }

    if (order.coupon_id) {
        await couponService.reverseRedemption(order.id).catch((err) => {
            logger.error({ err, orderId: order.id }, "cancel: coupon reversal error");
            Sentry.captureException(err, { tags: { area: "order", stage: "cancel-coupon-reversal" }, extra: { orderId: order.id } });
        });
    }

    // Call off any in-flight delivery before touching money - a rider
    // shouldn't show up (or keep an offer open) for a pickup that no
    // longer exists, whether or not the order was ever paid for.
    const activeOffer = await deliveryRepository.findActiveOffer(order.id).catch(() => null);
    if (activeOffer) {
        await deliveryRepository.expireOffer(activeOffer.id).catch((err) => {
            logger.error({ err, orderId: order.id }, "cancel: delivery offer expiry error");
        });
    }

    const delivery = await deliveryRepository.findByOrderId(order.id).catch(() => null);
    // deliveries.status has no 'cancelled' value (see migration 008) -
    // 'failed' is the closest existing status for "this delivery is no
    // longer happening"; the notes column records why.
    if (delivery && !["delivered", "failed"].includes(delivery.status)) {
        await deliveryRepository.updateStatus(delivery.id, "failed", "Order cancelled").catch((err) => {
            logger.error({ err, orderId: order.id }, "cancel: delivery status update error");
        });
    }

    if (!["paid", "deposit_paid"].includes(order.payment_status)) {
        return;
    }

    await walletService.reverseSellerEarningsForOrder(order.id).catch((err) => {
        logger.error({ err, orderId: order.id }, "cancel: seller earnings reversal error");
        Sentry.captureException(err, { tags: { area: "order", stage: "cancel-wallet-reversal" }, extra: { orderId: order.id } });
    });

    // Only a deposit was ever actually charged for a pre-order that's
    // cancelled before the balance is paid - refunding the full
    // total_amount would hand back money the buyer never paid in the
    // first place.
    const refundAmount = order.payment_status === "deposit_paid"
        ? Number(order.deposit_amount)
        : Number(order.total_amount);

    if (!refundAmount || refundAmount <= 0) return;

    // Refund cap (Phase 5, P0) - shares the same reservation dispute and
    // return refunds use, so a cancellation refund can't push the
    // order's total refunded past what was paid even if a dispute/return
    // partial refund already happened on this order. A reservation
    // failure here (cap already exhausted - shouldn't normally happen
    // for a whole-order cancellation refund, but could if a dispute
    // already refunded part of this order before it was cancelled) is
    // logged and the auto-refund is skipped rather than thrown, since
    // the order is already cancelled at this point and this path is
    // best-effort/fire-and-forget by design.
    try {
        await refundCapService.withTransaction((connection) =>
            refundCapService.reserveRefund(connection, { orderId: order.id, orderItemId: null, amount: refundAmount })
        );
    } catch (err) {
        logger.error({ err, orderId: order.id }, "cancel: refund cap reservation error");
        Sentry.captureException(err, { tags: { area: "order", stage: "cancel-refund-cap" }, extra: { orderId: order.id } });
        return;
    }

    await refundService.autoRefundForCancellation({ order, amount: refundAmount, requestedBy: null })
        .catch((err) => {
            logger.error({ err, orderId: order.id }, "cancel: auto-refund error");
            Sentry.captureException(err, { tags: { area: "order", stage: "cancel-auto-refund" }, extra: { orderId: order.id } });
        });
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

    let cancelled;

    if (order.is_parent) {
        const children = await orderRepository.findChildOrders(orderId);
        const nonCancellable = children.find((child) => !CANCELLABLE_STATUSES.includes(child.status));

        if (nonCancellable) {
            throw new Error(
                `Order can no longer be cancelled (vendor order ${nonCancellable.order_number} is "${nonCancellable.status}")`
            );
        }

        // Cancel a paid order (Phase 3, P0): conditional, not a plain
        // UPDATE - see order.repository.js#cancelChildOrdersIfCancellable.
        // The read-based check just above already gives a friendly
        // per-vendor error for the common case; this is the actual race
        // guard, covering a buyer cancel that lands in the same instant as
        // the stale-order sweep job cancelling the same order. A genuine
        // race (this returns fewer than `children.length`) is treated as
        // "someone else already finished cancelling it" - not an error,
        // just nothing further to do here.
        const changed = await orderRepository.cancelChildOrdersIfCancellable(orderId, CANCELLABLE_STATUSES);
        cancelled = changed > 0;

        if (cancelled) {
            // Stock-restoration fix: a split cart's items live on the
            // child orders, not the parent row itself (see
            // createSplitOrder), so restoring stock for a cancelled parent
            // means restoring every child's items in one pass - see
            // restoreStockForChildOrders. Only runs when this call is the
            // one that actually changed something - restoring stock twice
            // for the same cancellation would double-credit it back.
            await orderRepository.restoreStockForChildOrders(orderId);
            await orderRepository.cancelOrderIfCancellable(orderId, CANCELLABLE_STATUSES);
        }
    } else {
        if (!CANCELLABLE_STATUSES.includes(order.status)) {
            throw new Error(`Order can no longer be cancelled (status: ${order.status})`);
        }

        cancelled = await orderRepository.cancelOrderIfCancellable(orderId, CANCELLABLE_STATUSES);

        if (cancelled) {
            // Stock-restoration fix: give back whatever this standalone
            // order's items took at checkout - otherwise a cancelled order
            // permanently keeps its reserved stock, and a product can read
            // "out of stock" for a sale that never actually completed.
            await orderRepository.restoreStockForOrder(orderId);
        }
    }

    if (!cancelled) {
        // Lost the race entirely (e.g. the stale-order sweep job
        // cancelled this exact order between the check above and the
        // conditional UPDATE) - it's cancelled either way, which is what
        // the buyer asked for, so this isn't an error.
        return;
    }

    // Cancel a paid order (Phase 3, P0) - reverses loyalty/coupon,
    // seller earnings, and triggers an automatic refund if money was
    // actually paid. See reverseCancelledOrderEffects' own comment for
    // why this is fire-and-forget from here.
    await reverseCancelledOrderEffects(order);

    // Item context for the notification (Phase 6, UI/UX remediation) -
    // null for a multi-vendor parent order (its items live on the child
    // orders, not this row - see getPrimaryItemSummary's comment), in
    // which case this falls back to the existing order-number-only
    // message key exactly as before this existed.
    const { itemName, itemCount } = await orderRepository.getPrimaryItemSummary(orderId);
    const itemSummary = buildItemSummary(itemName, itemCount);

    await notificationService.notify({
        userId: buyerId,
        type: "order_cancelled",
        titleKey: "notifications.order.cancelled.title",
        messageKey: itemSummary ? "notifications.order.cancelled.messageWithItem" : "notifications.order.cancelled.message",
        messageParams: { orderNumber: order.order_number, itemSummary },
        relatedOrderId: orderId,
        withEmail: true
    });
};

// System-initiated (not buyer-initiated) - called by the staleOrders
// background job. Unlike cancelOrder above, there's no buyer ownership
// check since there's no requesting user; the query that selects
// candidates (findStalePendingMobileMoneyOrders) is what scopes this -
// which, per Phase 1's provider-status-check fix, only ever selects
// orders confirmed NOT paid at the provider, so reverseCancelledOrderEffects'
// paid/deposit_paid branch is normally a no-op here. It's still called
// unconditionally (not skipped for this caller) because loyalty/coupon
// reversal applies regardless of payment status, and because a pre-order
// deposit genuinely can have been paid before the order went stale and
// unpaid on the (separate) balance leg.
exports.autoCancelStaleOrder = async (order) => {
    let cancelled;

    if (order.is_parent) {
        // Cancel a paid order (Phase 3, P0): conditional, not a plain
        // UPDATE - see order.repository.js#cancelChildOrdersIfCancellable.
        // Unlike cancelOrder above, there's no per-child validation needed
        // here (no buyer-facing cancellability check - see the comment
        // above this function), so this can go straight to the conditional
        // UPDATE without a separate read-based check first.
        const changed = await orderRepository.cancelChildOrdersIfCancellable(order.id, CANCELLABLE_STATUSES);
        cancelled = changed > 0;

        if (cancelled) {
            // Stock-restoration fix: same reasoning as cancelOrder above -
            // these orders never got a payment confirmation at all, so the
            // stock they reserved at checkout must go back. Only runs when
            // this call is the one that actually changed something -
            // restoring stock twice (e.g. racing a buyer-initiated cancel
            // of the same order) would double-credit it back.
            await orderRepository.restoreStockForChildOrders(order.id);
            await orderRepository.cancelOrderIfCancellable(order.id, CANCELLABLE_STATUSES);
        }
    } else {
        cancelled = await orderRepository.cancelOrderIfCancellable(order.id, CANCELLABLE_STATUSES);

        if (cancelled) {
            // Stock-restoration fix: standalone stale/unpaid order -
            // restore its own items' stock the same way.
            await orderRepository.restoreStockForOrder(order.id);
        }
    }

    if (!cancelled) {
        // A buyer-initiated cancelOrder (or a previous run of this same
        // job) already got there first - nothing further to do.
        return;
    }

    await reverseCancelledOrderEffects(order);

    // Item context for the notification (Phase 6, UI/UX remediation) -
    // same lookup/fallback shape as cancelOrder above: null for a
    // multi-vendor parent order (its items live on the child orders, not
    // this row - see getPrimaryItemSummary's comment), in which case this
    // falls back to the existing order-number-only message key exactly
    // as before this existed.
    const { itemName, itemCount } = await orderRepository.getPrimaryItemSummary(order.id);
    const itemSummary = buildItemSummary(itemName, itemCount);

    await notificationService.notify({
        userId: order.buyer_id,
        type: "order_cancelled",
        titleKey: "notifications.order.cancelled.title",
        messageKey: itemSummary ? "notifications.order.cancelledUnpaid.messageWithItem" : "notifications.order.cancelledUnpaid.message",
        messageParams: { orderNumber: order.order_number, itemSummary },
        relatedOrderId: order.id,
        withEmail: true
    });
};

exports.getSellerOrders = async (sellerId, query = {}) => {
    return orderRepository.findOrdersBySeller(sellerId, {
        status: query.status || null,
        q: query.q || null,
        sort: query.sort || null
    });
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

    // C1 (remediation): same "stuck wallet credit" signal as
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
    //
    // Pre-order / made-to-order (Phase 8): a pre-order only needs the
    // deposit in to start being worked on - "paid" (full amount) isn't
    // reached until the balance is settled, which normally happens much
    // later, once the item is actually made. Gating shipment specifically
    // on full payment is handled separately, just below.
    const hasEnoughToStart = order.payment_status === "paid"
        || (order.order_type === "pre_order" && order.payment_status === "deposit_paid");

    if (order.payment_method !== "cash_on_delivery" && !hasEnoughToStart) {
        throw new Error("This order can't be accepted yet - payment hasn't been verified");
    }

    const allowedNext = SELLER_STATUS_TRANSITIONS[order.status] || [];

    if (!allowedNext.includes(newStatus)) {
        throw new Error(
            `Cannot move order from "${order.status}" to "${newStatus}"`
        );
    }

    // A pre-order can't ship until the remaining balance is paid -
    // shipping is what hands the order to a delivery agent and (once
    // delivered) starts the seller's escrow release clock, both of which
    // assume the order is fully paid for.
    if (newStatus === "shipped" && order.order_type === "pre_order" && order.payment_status !== "paid") {
        throw new Error("The remaining balance must be paid before this order can be shipped");
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

    // Item context for the notification (Phase 6, UI/UX remediation) -
    // same lookup/fallback shape as cancelOrder/autoCancelStaleOrder
    // above: null for a multi-vendor parent order, in which case this
    // falls back to the existing order-number-only message key exactly
    // as before this existed.
    const { itemName, itemCount } = await orderRepository.getPrimaryItemSummary(orderId);
    const itemSummary = buildItemSummary(itemName, itemCount);

    await notificationService.notify({
        userId: order.buyer_id,
        type: "order_status_update",
        titleKey: "notifications.order.statusUpdated.title",
        messageKey: itemSummary ? "notifications.order.statusUpdated.messageWithItem" : "notifications.order.statusUpdated.message",
        messageParams: { orderNumber: order.order_number, status: newStatus, itemSummary },
        relatedOrderId: orderId,
        withEmail: true,
        withWhatsApp: true
    });
};

// Pre-order / made-to-order (Phase 8) - the seller-triggered "it's ready,
// please pay the rest" step. Deliberately a separate explicit action
// rather than something that fires automatically off a status change:
// the seller knows when the item is actually finished, which doesn't
// necessarily line up with any particular order-status transition.
exports.requestPreorderBalance = async (orderId, sellerId) => {
    const order = await orderRepository.findOrderById(orderId);

    if (!order) {
        throw new Error("Order not found");
    }

    const ownsItem = await orderRepository.sellerHasItemInOrder(orderId, sellerId);
    if (!ownsItem) {
        throw new Error("Order not found");
    }

    if (order.order_type !== "pre_order") {
        throw new Error("This order isn't a pre-order");
    }

    if (order.payment_status !== "deposit_paid") {
        throw new Error(
            order.payment_status === "paid"
                ? "The balance for this order has already been paid"
                : "The deposit for this order hasn't been paid yet"
        );
    }

    await orderRepository.markBalanceRequested(orderId);

    await notificationService.notify({
        userId: order.buyer_id,
        type: "preorder_balance_due",
        titleKey: "notifications.order.preorderBalanceDue.title",
        messageKey: "notifications.order.preorderBalanceDue.message",
        messageParams: { orderNumber: order.order_number, balanceAmount: order.balance_amount },
        relatedOrderId: orderId,
        withEmail: true,
        withWhatsApp: true
    });

    auditService.log({
        userId: sellerId,
        eventType: "preorder_balance_requested",
        description: `Balance payment requested for pre-order ${order.order_number}`,
        metadata: { orderId, balanceAmount: order.balance_amount }
    });

    return { orderId, balanceAmount: order.balance_amount };
};

// (Checkout & Order Timeline UX): a pre-payment estimate of how
// long delivery is likely to take, using the exact same distance/duration
// calculation the platform already relies on for rider pay (see
// deliveryPricingService.estimateDeliveryForRoute) - just run against the
// buyer's current cart instead of an order row, since none exists yet at
// checkout time.
//
// A cart can span multiple vendors (see checkout's own bySeller grouping
// above), so this estimates each vendor's own pickup -> delivery leg
// separately and surfaces the SLOWEST one - the buyer's parcel isn't
// "delivered" for tracking purposes until every vendor's leg is, so
// quoting the fastest leg would understate the wait. `method` reports
// "distance" only when every vendor's leg had a real route; if even one
// vendor has no pickup pin on file yet, the honest answer is "unknown",
// not an average that quietly drops the missing one.
exports.getDeliveryEstimate = async (buyerId, { deliveryLat, deliveryLng }) => {
    const cart = await cartRepository.getCartByUser(buyerId);

    if (!cart.length) {
        throw new Error("Your cart is empty");
    }

    const sellerIds = [...new Set(cart.map((item) => item.seller_id))];

    const estimates = await Promise.all(sellerIds.map(async (sellerId) => {
        const seller = await sellerRepository.findByUserId(sellerId);
        return deliveryPricingService.estimateDeliveryForRoute({
            pickupLat: seller?.pickup_lat ?? null,
            pickupLng: seller?.pickup_lng ?? null,
            deliveryLat,
            deliveryLng
        });
    }));

    const allKnown = estimates.every((estimate) => estimate.durationMinutes != null);
    const durationMinutes = allKnown
        ? Math.max(...estimates.map((estimate) => estimate.durationMinutes))
        : null;
    const degraded = estimates.some((estimate) => estimate.degraded);

    return {
        durationMinutes,
        method: allKnown ? "distance" : "flat",
        degraded,
        vendorCount: sellerIds.length
    };
};
