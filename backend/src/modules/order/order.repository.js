const db = require("../../config/db");
// Coupon/points integrity (Phase 3, P0) - redemption is now committed
// INSIDE the order's own creation transaction (see commitDiscountRedemptions
// below), not as a separate post-creation step in order.service.js, so a
// checkout that fails after the order row exists rolls the redemption back
// too instead of having already burned the buyer's code/points for an
// order that was never actually placed.
const couponService = require("../coupon/coupon.service");
const referralService = require("../referral/referral.service");

// Phase 2 (Legal & Consumer Trust): the version of the consent bundle
// (Terms of Service + Privacy Policy + Refund Policy) a buyer agrees to
// at checkout. Mirrors auth.service.js's CURRENT_TERMS_VERSION - bump it
// when the consented documents materially change, and every order placed
// from then on records the new version without a migration.
//
// Lives here rather than in order.service.js purely to respect Phase 2's
// file-scope list (order.service.js isn't in it). See PHASE_2_NOTES.md.
const CURRENT_CHECKOUT_TERMS_VERSION = "2026-09-18";

// Shared by createOrder/createSplitOrder below: insert one `orders` row
// (optionally as a child of `parentOrderId`) and return its insertId.
// buyerProtectionAddon/Fee (Phase Q1) only apply to the top-level row a
// buyer actually pays for (standalone order, or the parent of a split
// cart) - child orders default to 0/false since the guarantee covers the
// whole cart, not a single vendor's slice of it.
const insertOrderRow = async (connection, { buyerId, parentOrderId, isParent, orderNumber, shippingInfo, totalAmount, buyerProtectionAddon = false, buyerProtectionFee = 0, pickupPointId = null, buyerAddressId = null, loyaltyPointsRedeemed = 0, loyaltyDiscountAmount = 0, couponId = null, couponDiscountAmount = 0, preorder = null }) => {
    // Checkout consent (Phase 2). Only the top-level row a buyer actually
    // agreed to and paid for carries the consent record - exactly the
    // same reasoning as buyerProtectionAddon/Fee above: a child order is
    // an internal per-vendor split of one purchase, not a second thing
    // the buyer consented to, so stamping it on each child would
    // overstate how many consents were actually given.
    const isTopLevel = parentOrderId === null;

    // Accepts a real boolean (JSON body) or the string "true" (multipart/
    // older clients), matching how auth.validator.js treats the signup
    // `terms_accepted` field, so the two consent gates never diverge on
    // what counts as consent.
    const consentGiven = shippingInfo.checkout_terms_accepted === true
        || shippingInfo.checkout_terms_accepted === "true";

    // Deliberately STAMPS rather than ENFORCES. Enforcement lives in
    // order.validator.js#checkoutValidation, at the HTTP layer.
    //
    // Why no belt-and-suspenders throw here (unlike auth.service.js's
    // re-check of signup consent): insertOrderRow is shared by a SECOND
    // purchase path that legitimately has no consent field -
    // groupBuy.service.js#claim calls createOrder directly with its own
    // shippingInfo, built from GroupBuyDetail.jsx's claim form, which has
    // no consent checkbox. Throwing here would break group-buy claims
    // outright, and both groupBuy.service.js and order.service.js are
    // outside Phase 2's file list, so neither can be given a consent gate
    // in this phase.
    //
    // A group-buy-claimed order therefore stores NULL in both columns -
    // honestly recording "no consent was captured on this path" rather
    // than fabricating one. **That gap is real and is flagged as a
    // follow-up in PHASE_2_NOTES.md.**
    const checkoutTermsVersion = isTopLevel && consentGiven ? CURRENT_CHECKOUT_TERMS_VERSION : null;

    // Timestamped server-side rather than trusted from the client, for
    // the same reason auth.repository.js sets terms_accepted_at to "now"
    // instead of accepting a client-supplied value: by the time this
    // runs, order.validator.js has already verified consent, so "now" IS
    // the moment of record.
    const checkoutTermsAcceptedAt = isTopLevel && consentGiven ? new Date() : null;

    // Pre-order / made-to-order (Phase 8) - only ever passed for a
    // standalone order (see order.service.js#checkout: a split/multi-
    // vendor cart can't contain pre-order items), so every other caller
    // of insertOrderRow (createSplitOrder's parent + child rows) just
    // gets the column defaults ('standard' order_type, NULL deposit).
    const orderType = preorder ? "pre_order" : "standard";

    // Delivery proof handover code (Phase 5, P0) - generated at order
    // creation time (not at agent assignment) so the buyer can be told
    // it as soon as they place the order, before a rider is even
    // matched. A parent order (multi-vendor cart) doesn't itself get
    // delivered - its children do - but giving it a code too is
    // harmless and keeps this one code path simple rather than special-
    // casing is_parent here.
    const deliveryHandoverCode = String(Math.floor(100000 + Math.random() * 900000));

    const [orderResult] = await connection.query(
        `INSERT INTO orders
        (order_number, buyer_id, parent_order_id, is_parent, status, payment_status, payment_method,
         shipping_address, shipping_city, shipping_region, shipping_phone, pickup_point_id, buyer_address_id,
         delivery_lat, delivery_lng, total_amount, buyer_protection_addon, buyer_protection_fee,
         loyalty_points_redeemed, loyalty_discount_amount, coupon_id, coupon_discount_amount,
         order_type, preorder_lead_time_days, preorder_ready_by, deposit_amount, balance_amount,
         checkout_terms_accepted_at, checkout_terms_version, delivery_handover_code)
        VALUES (?, ?, ?, ?, 'pending', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?)`,
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
            buyerAddressId,
            shippingInfo.delivery_lat ?? null,
            shippingInfo.delivery_lng ?? null,
            totalAmount,
            buyerProtectionAddon ? 1 : 0,
            buyerProtectionFee,
            loyaltyPointsRedeemed,
            loyaltyDiscountAmount,
            couponId,
            couponDiscountAmount,
            orderType,
            preorder ? preorder.leadTimeDays : null,
            preorder ? preorder.readyBy : null,
            preorder ? preorder.depositAmount : null,
            preorder ? preorder.balanceAmount : null,
            checkoutTermsAcceptedAt,
            checkoutTermsVersion,
            deliveryHandoverCode
        ]
    );

    // Return shape deliberately unchanged (still a bare insertId, not
    // { insertId, ... }) - insertOrderRow has three call sites below and
    // this phase doesn't need the code at creation time itself; a caller
    // that wants to notify the buyer with it (order.service.js) reads it
    // back via orderRepository.findOrderById(id).delivery_handover_code
    // instead, which avoids rippling a shape change through every call
    // site and their own callers for one notification step.
    return orderResult.insertId;
};

// Insert this order's line items + decrement stock. Throws (and lets the
// caller roll back) if any item no longer has enough stock.
//
// Batched  previously this ran 2 queries per line item (an
// INSERT then an UPDATE) - a 10-item cart was 20 sequential round trips
// inside one checkout transaction. Product IDs within a single cart are
// always distinct (cart_items has a UNIQUE(user_id, product_id)
// constraint), so a single multi-row INSERT plus a single CASE-based
// UPDATE covers every line item safely in 2 queries total. The extra
// SELECT below only runs on the (rare) insufficient-stock path, to work
// out which item's error message to raise - same message the old
// per-item loop gave.
//
// continuation (UI/UX remediation) - variant-aware. A cart can
// mix plain-product line items (variant_id falsy) and variant line items
// in the same checkout, so stock is decremented against two different
// tables (products vs product_variants) using the exact same atomic
// "CASE WHEN id THEN stock - qty ... guarded by stock >= qty" pattern
// for each - see the plain-product path's own long-standing comment
// below for why this shape (a single bulk UPDATE, not one UPDATE per
// item) matters under concurrent checkouts.
const insertOrderItems = async (connection, orderId, cartItems) => {
    if (!cartItems.length) {
        return;
    }

    // Commission at checkout (Phase 2) - order.service.js#checkout attaches
    // commission_rate/commission_amount/seller_net_amount to every cart item
    // before this runs, so they're snapshotted here alongside everything
    // else. Falls back to NULL (exactly the pre-Phase-2 shape) if a caller
    // somehow skips that step, and wallet.service.js#creditSellersForOrder
    // still computes it fresh in that case - see that function's comment.
    const insertValues = cartItems.map((item) => [
        orderId, item.product_id, item.variant_id || 0, item.variant_label || null,
        item.seller_id, item.quantity, item.unit_price, item.subtotal,
        item.commission_rate ?? null, item.commission_amount ?? null, item.seller_net_amount ?? null
    ]);

    await connection.query(
        `INSERT INTO order_items
        (order_id, product_id, variant_id, variant_label, seller_id, quantity, unit_price, subtotal,
         commission_rate, commission_amount, seller_net_amount)
        VALUES ?`,
        [insertValues]
    );

    const plainItems = cartItems.filter((item) => !item.variant_id);
    const variantItems = cartItems.filter((item) => item.variant_id);

    if (plainItems.length) {
        const productIds = plainItems.map((item) => item.product_id);
        const caseClauses = plainItems.map(() => "WHEN ? THEN stock - ?").join(" ");
        const caseParams = plainItems.flatMap((item) => [item.product_id, item.quantity]);
        const guardClauses = plainItems.map(() => "(id = ? AND stock >= ?)").join(" OR ");
        const guardParams = plainItems.flatMap((item) => [item.product_id, item.quantity]);

        const [stockResult] = await connection.query(
            `UPDATE products
            SET stock = CASE id ${caseClauses} END
            WHERE id IN (?) AND (${guardClauses})`,
            [...caseParams, productIds, ...guardParams]
        );

        if (stockResult.affectedRows < plainItems.length) {
            const [rows] = await connection.query(
                "SELECT id, stock FROM products WHERE id IN (?)",
                [productIds]
            );
            const stockById = new Map(rows.map((row) => [row.id, row.stock]));

            for (const item of plainItems) {
                const currentStock = stockById.get(item.product_id) ?? 0;

                if (currentStock < item.quantity) {
                    throw new Error(`"${item.name}" no longer has enough stock`);
                }
            }
        }
    }

    if (variantItems.length) {
        const variantIds = variantItems.map((item) => item.variant_id);
        const caseClauses = variantItems.map(() => "WHEN ? THEN stock - ?").join(" ");
        const caseParams = variantItems.flatMap((item) => [item.variant_id, item.quantity]);
        const guardClauses = variantItems.map(() => "(id = ? AND stock >= ?)").join(" OR ");
        const guardParams = variantItems.flatMap((item) => [item.variant_id, item.quantity]);

        const [stockResult] = await connection.query(
            `UPDATE product_variants
            SET stock = CASE id ${caseClauses} END
            WHERE id IN (?) AND (${guardClauses})`,
            [...caseParams, variantIds, ...guardParams]
        );

        if (stockResult.affectedRows < variantItems.length) {
            const [rows] = await connection.query(
                "SELECT id, stock FROM product_variants WHERE id IN (?)",
                [variantIds]
            );
            const stockById = new Map(rows.map((row) => [row.id, row.stock]));

            for (const item of variantItems) {
                const currentStock = stockById.get(item.variant_id) ?? 0;

                if (currentStock < item.quantity) {
                    throw new Error(`"${item.name}" (${item.variant_label || "selected option"}) no longer has enough stock`);
                }
            }
        }
    }
};

// Checkout idempotency (Phase 3) - locks exactly the cart rows this
// checkout was quoted against before anything else runs in the
// transaction. A second concurrent checkout attempt for the same buyer
// (double submit, a retried request after a slow response) blocks on this
// FOR UPDATE until the first attempt commits (and the DELETE at the end of
// this function removes these very rows) or rolls back; once this
// attempt's rows are gone, the second attempt's lock query comes back
// short and is rejected instead of silently creating a second order from
// the same cart. `cartItems` with no `cart_item_id` at all (the
// groupBuy.service.js#claim path - no real cart involved, see its own
// claim-lock instead) skips this entirely rather than locking nothing.
const lockAndValidateCartRows = async (connection, cartItems) => {
    const cartItemIds = cartItems.map((item) => item.cart_item_id).filter(Boolean);
    if (!cartItemIds.length) return [];

    const [lockedRows] = await connection.query(
        "SELECT id, quantity FROM cart_items WHERE id IN (?) FOR UPDATE",
        [cartItemIds]
    );
    const quantityById = new Map(lockedRows.map((row) => [row.id, row.quantity]));

    for (const item of cartItems) {
        if (quantityById.get(item.cart_item_id) !== item.quantity) {
            throw new Error("Your cart changed - please review it and try again");
        }
    }

    return cartItemIds;
};

// Coupon and points integrity (Phase 3, P0) - commits both redemptions
// inside the caller's own order-creation transaction (connection), after
// the order row exists (orderId) but before commit, so a checkout that
// fails anywhere in the transaction rolls these back along with the order
// and stock changes instead of having already burned the buyer's code or
// points. Both services' own race guards (coupon max_redemptions /
// uq_coupon_redemptions_user, loyalty_points >= ?) are what make this safe
// under concurrent checkouts - see coupon.repository.js#recordRedemption
// and referral.repository.js#addPoints.
const commitDiscountRedemptions = async (connection, { buyerId, orderId, loyalty = {}, coupon = {} }) => {
    await referralService.commitRedemption(buyerId, loyalty.pointsRedeemed, orderId, connection);
    await couponService.commitRedemption(coupon.couponId, buyerId, orderId, coupon.discountAmount, connection);
};

// Create a single (non-split) order + its items + decrement stock, all in
// one transaction. cartItems: rows from cart_items joined with product
// price/stock (see order.service.js). Used for single-vendor checkouts.
exports.createOrder = async (buyerId, orderNumber, shippingInfo, cartItems, totalAmount, buyerProtection = {}, pickupPointId = null, loyalty = {}, buyerAddressId = null, coupon = {}, preorder = null) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const cartItemIds = await lockAndValidateCartRows(connection, cartItems);

        const orderId = await insertOrderRow(connection, {
            buyerId, parentOrderId: null, isParent: false, orderNumber, shippingInfo, totalAmount,
            buyerProtectionAddon: buyerProtection.addon, buyerProtectionFee: buyerProtection.fee, pickupPointId,
            buyerAddressId,
            loyaltyPointsRedeemed: loyalty.pointsRedeemed, loyaltyDiscountAmount: loyalty.discountAmount,
            couponId: coupon.couponId, couponDiscountAmount: coupon.discountAmount,
            preorder
        });

        await insertOrderItems(connection, orderId, cartItems);

        await commitDiscountRedemptions(connection, { buyerId, orderId, loyalty, coupon });

        // Scoped to exactly the rows this checkout locked above, not a
        // blanket "everything this buyer currently has in cart" delete -
        // the old shape also meant groupBuy.service.js#claim (which calls
        // this function directly with no real cart involved at all, see
        // its own header comment) was silently wiping the buyer's
        // unrelated shopping cart as a side effect of claiming a group
        // buy. cartItemIds is empty on that path, so this is a no-op there.
        if (cartItemIds.length) {
            await connection.query("DELETE FROM cart_items WHERE id IN (?)", [cartItemIds]);
        }

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
exports.createSplitOrder = async (buyerId, parentOrderNumber, shippingInfo, sellerGroups, totalAmount, buyerProtection = {}, pickupPointId = null, loyalty = {}, buyerAddressId = null, coupon = {}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const allItems = sellerGroups.flatMap((group) => group.items);
        const cartItemIds = await lockAndValidateCartRows(connection, allItems);

        const parentOrderId = await insertOrderRow(connection, {
            buyerId, parentOrderId: null, isParent: true, orderNumber: parentOrderNumber, shippingInfo, totalAmount,
            buyerProtectionAddon: buyerProtection.addon, buyerProtectionFee: buyerProtection.fee, pickupPointId,
            buyerAddressId,
            loyaltyPointsRedeemed: loyalty.pointsRedeemed, loyaltyDiscountAmount: loyalty.discountAmount,
            couponId: coupon.couponId, couponDiscountAmount: coupon.discountAmount
        });

        // Discount funding (Phase 3) - a coupon/loyalty discount applied at
        // the whole-cart level previously vanished entirely from a split
        // cart's per-vendor child rows (only the parent carried it), which
        // understated what each vendor's own order actually reflects once
        // a buyer-protection fee or a per-vendor refund needs to reference
        // it. Recorded here pro-rata to each vendor's share of the
        // pre-discount cart subtotal, purely for accounting/display on the
        // child row - the parent row remains the authoritative total the
        // buyer actually paid and the one coupon_redemptions/loyalty ledger
        // entries are keyed against (see commitDiscountRedemptions below,
        // still called once against parentOrderId, not per child).
        // Whether this split is seller-funded (reduces seller payout) or
        // platform-funded (seller is paid as if full price) is a separate,
        // open policy question - see this phase's "Decision needed" note;
        // the figures recorded here don't yet feed into wallet crediting
        // either way.
        const totalCouponDiscount = Number(coupon.discountAmount) || 0;
        const totalLoyaltyDiscount = Number(loyalty.discountAmount) || 0;
        const preDiscountSubtotal = sellerGroups.reduce((sum, group) => sum + Number(group.subtotal), 0);

        const childOrders = [];
        let vendorIndex = 1;

        for (const group of sellerGroups) {
            const childOrderNumber = `${parentOrderNumber}-V${vendorIndex}`;
            const share = preDiscountSubtotal > 0 ? Number(group.subtotal) / preDiscountSubtotal : 0;
            const isLastGroup = vendorIndex === sellerGroups.length;

            // The last vendor absorbs whatever rounding remainder is left
            // over so the sum of child discount amounts always matches the
            // parent's total exactly, rather than drifting by a cent or
            // two across several vendors' independent roundings.
            const runningCoupon = childOrders.reduce((sum, child) => sum + child.couponDiscountShare, 0);
            const runningLoyalty = childOrders.reduce((sum, child) => sum + child.loyaltyDiscountShare, 0);
            const couponDiscountShare = isLastGroup
                ? Number((totalCouponDiscount - runningCoupon).toFixed(2))
                : Number((totalCouponDiscount * share).toFixed(2));
            const loyaltyDiscountShare = isLastGroup
                ? Number((totalLoyaltyDiscount - runningLoyalty).toFixed(2))
                : Number((totalLoyaltyDiscount * share).toFixed(2));

            const childOrderId = await insertOrderRow(connection, {
                buyerId,
                parentOrderId,
                isParent: false,
                orderNumber: childOrderNumber,
                shippingInfo,
                totalAmount: group.subtotal,
                pickupPointId,
                couponId: coupon.couponId,
                couponDiscountAmount: couponDiscountShare,
                loyaltyDiscountAmount: loyaltyDiscountShare
            });

            await insertOrderItems(connection, childOrderId, group.items);

            childOrders.push({
                sellerId: group.sellerId,
                orderId: childOrderId,
                orderNumber: childOrderNumber,
                couponDiscountShare,
                loyaltyDiscountShare
            });

            vendorIndex += 1;
        }

        await commitDiscountRedemptions(connection, { buyerId, orderId: parentOrderId, loyalty, coupon });

        if (cartItemIds.length) {
            await connection.query("DELETE FROM cart_items WHERE id IN (?)", [cartItemIds]);
        }

        await connection.commit();

        return { parentOrderId, childOrders };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// Restores stock the mirror-image way `insertOrderItems` above decrements
// it - used when an order that already took stock (any order that
// reached `insertOrderItems`, i.e. every standalone/child order; a bare
// parent row never carries items of its own - see createSplitOrder)
// is cancelled, whether buyer-initiated (cancelOrder) or system-initiated
// as stale/unpaid (autoCancelStaleOrder). Without this, a mobile-money
// order that's cancelled or expires unpaid permanently keeps the stock
// it reserved, so a product can read "out of stock" for a sale that
// never actually completed.
//
// `rows` here is already `{ product_id, variant_id, quantity }` - either
// a single order's items, or (via restoreStockForChildOrders below) every
// item across a whole parent's children in one shot. Quantities are
// summed per id first (a plain object.reduce, not more SQL) so this
// stays correct even if the same product/variant somehow appears more
// than once across the rows being restored - the CASE-WHEN update below
// only keeps the LAST match per id otherwise, silently under-restoring.
const applyStockIncrease = async (executor, rows) => {
    if (!rows.length) return;

    const plainTotals = new Map();
    const variantTotals = new Map();

    for (const row of rows) {
        if (row.variant_id) {
            variantTotals.set(row.variant_id, (variantTotals.get(row.variant_id) || 0) + row.quantity);
        } else {
            plainTotals.set(row.product_id, (plainTotals.get(row.product_id) || 0) + row.quantity);
        }
    }

    if (plainTotals.size) {
        const ids = [...plainTotals.keys()];
        const caseClauses = ids.map(() => "WHEN ? THEN stock + ?").join(" ");
        const caseParams = ids.flatMap((id) => [id, plainTotals.get(id)]);

        await executor.query(
            `UPDATE products
            SET stock = CASE id ${caseClauses} END
            WHERE id IN (?)`,
            [...caseParams, ids]
        );
    }

    if (variantTotals.size) {
        const ids = [...variantTotals.keys()];
        const caseClauses = ids.map(() => "WHEN ? THEN stock + ?").join(" ");
        const caseParams = ids.flatMap((id) => [id, variantTotals.get(id)]);

        await executor.query(
            `UPDATE product_variants
            SET stock = CASE id ${caseClauses} END
            WHERE id IN (?)`,
            [...caseParams, ids]
        );
    }
};

// Restores stock for a single standalone or child order's items. Safe to
// call even for an order with no items (no-op).
exports.restoreStockForOrder = async (orderId) => {
    const [rows] = await db.query(
        "SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?",
        [orderId]
    );

    await applyStockIncrease(db, rows);
};

// Restores stock for every child order under a parent in one pass -
// mirrors updateOrderStatusForChildren's "one batched query, not N" shape
// rather than looping restoreStockForOrder per child.
exports.restoreStockForChildOrders = async (parentOrderId) => {
    const [rows] = await db.query(
        `SELECT oi.product_id, oi.variant_id, oi.quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.parent_order_id = ?`,
        [parentOrderId]
    );

    await applyStockIncrease(db, rows);
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

// Unpaid non-COD orders (mobile money, card, PayPal, wallet) that have sat
// past their cutoff (hosted checkout sessions get a longer one) AND have no
// payment attempt still in flight or already completed. A payment that is
// still 'pending' is settled first by the stale-payment sweep (which asks
// the provider); only an order with nothing pending is cancelled here.
exports.findStaleUnpaidOrders = async ({ cutoffMinutes, hostedCutoffMinutes }) => {
    const [rows] = await db.query(
        `SELECT o.id, o.buyer_id, o.order_number, o.is_parent FROM orders o
        WHERE o.status = 'pending' AND o.payment_status = 'unpaid'
            AND o.payment_method IN ('mobile_money', 'snippe', 'malipopay_card', 'paypal', 'wallet')
            AND o.parent_order_id IS NULL
            AND o.created_at < (NOW() - INTERVAL
                CASE WHEN o.payment_method IN ('snippe', 'malipopay_card', 'paypal') THEN ? ELSE ? END MINUTE)
            AND NOT EXISTS (
                SELECT 1 FROM payments p
                WHERE p.order_id = o.id AND p.status IN ('pending', 'completed', 'chargeback')
            )`,
        [hostedCutoffMinutes, cutoffMinutes]
    );
    return rows;
};

// Only top-level orders: standalone orders and parent orders. Child
// orders (parent_order_id set) are reached via a parent's detail view,
// not listed separately here, so a split cart shows as one row.
// Phase 4 (UI/UX remediation) - filtering + pagination. Previously this
// fetched every order a buyer had ever placed in one unfiltered,
// unpaginated call - fine for a new buyer, a real problem a year in.
// `q` matches either the order number or any product name within the
// order (via EXISTS, not a JOIN, so an order with many line items still
// only ever produces one row).
// Whitelisted sort options for order listings (buyer/seller/admin) - never
// interpolate a caller-supplied sort string directly into SQL, so any
// unrecognized value silently falls back to the existing default (newest
// first) rather than being rejected or, worse, passed straight into ORDER BY.
const ORDER_SORT_CLAUSES = {
    newest: "o.created_at DESC",
    oldest: "o.created_at ASC",
    // Nulls (parent/multi-vendor rows with no order_items of their own,
    // or - seller-scoped - orders where this seller's items were removed)
    // sort last instead of first.
    item_name: "primary_item_name IS NULL, primary_item_name ASC",
    status: "o.status ASC, o.created_at DESC",
    amount_high: "o.total_amount DESC",
    amount_low: "o.total_amount ASC"
};

const resolveOrderSort = (sort) => ORDER_SORT_CLAUSES[sort] || ORDER_SORT_CLAUSES.newest;
exports.resolveOrderSort = resolveOrderSort;

exports.findOrdersByBuyer = async (buyerId, { status, from, to, q, sort, page = 1, limit = 10 } = {}) => {
    const offset = (page - 1) * limit;
    const conditions = ["o.buyer_id = ?", "o.parent_order_id IS NULL"];
    const params = [buyerId];

    if (status) {
        conditions.push("o.status = ?");
        params.push(status);
    }
    if (from) {
        conditions.push("o.created_at >= ?");
        params.push(from);
    }
    if (to) {
        conditions.push("o.created_at <= ?");
        params.push(to);
    }
    if (q) {
        conditions.push(
            `(o.order_number LIKE ? OR EXISTS (
                SELECT 1 FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id AND p.name LIKE ?
            ))`
        );
        params.push(`%${q}%`, `%${q}%`);
    }

    const whereClause = conditions.join(" AND ");
    const orderByClause = resolveOrderSort(sort);

    const [rows] = await db.query(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at, o.is_parent,
                (SELECT COUNT(*) FROM orders c WHERE c.parent_order_id = o.id) AS vendor_count,
                (SELECT p.name FROM order_items oi
                    JOIN products p ON p.id = oi.product_id
                    WHERE oi.order_id = o.id ORDER BY oi.id ASC LIMIT 1) AS primary_item_name
        FROM orders o
        WHERE ${whereClause}
        ORDER BY ${orderByClause}
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM orders o WHERE ${whereClause}`,
        params
    );

    return { orders: rows, total };
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

exports.findOrderById = async (orderId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT * FROM orders WHERE id = ?",
        [orderId]
    );
    return rows[0];
};

// Wallet order payment atomic (Phase 2, P0) - locks the order row for the
// whole "check it's still payable, debit the wallet, mark it paid"
// sequence in payment.service.js#initiateWalletOrderPayment, so a second
// concurrent wallet-payment attempt for the same order blocks here instead
// of racing the debit.
exports.findOrderByIdForUpdate = async (orderId, executor) => {
    const [rows] = await executor.query(
        "SELECT * FROM orders WHERE id = ? FOR UPDATE",
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

// Cancel a paid order (Phase 3, P0) - conditional status flip, not a plain
// UPDATE. Returns whether a row actually changed so callers (cancelOrder,
// autoCancelStaleOrder) know whether to go on to restore stock / reverse
// earnings / refund, or whether another request already did - a buyer
// cancel racing the stale-order sweep job for the same order (or a
// retried request hitting this twice) previously could both "succeed" and
// each restore the same stock, double-crediting it back.
exports.cancelOrderIfCancellable = async (orderId, cancellableStatuses, executor = db) => {
    const [result] = await executor.query(
        "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status IN (?)",
        [orderId, cancellableStatuses]
    );
    return result.affectedRows > 0;
};

// Same conditional shape as cancelOrderIfCancellable above, for every
// child order under a parent at once (mirrors updateOrderStatusForChildren's
// batched-not-N shape). Returns how many children actually changed, so the
// caller can tell "every child was still cancellable and got cancelled"
// from "some/all of them had already moved on (or were already cancelled
// by a race) and this is a partial/no-op".
exports.cancelChildOrdersIfCancellable = async (parentOrderId, cancellableStatuses, executor = db) => {
    const [result] = await executor.query(
        "UPDATE orders SET status = 'cancelled' WHERE parent_order_id = ? AND status IN (?)",
        [parentOrderId, cancellableStatuses]
    );
    return result.affectedRows;
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

// Cash on Delivery auto-confirm (Phase 2, P0) - candidates for
// jobs/codAutoConfirm.job.js: delivered (per the delivery record, not just
// order.status) at least `hours` ago, Cash on Delivery, not yet confirmed
// by the buyer, and not tied up in an open dispute. Mirrors the shape of
// wallet.repository.js's own escrow-release query.
exports.findCodOrdersPendingAutoConfirm = async (hours) => {
    const [rows] = await db.query(
        `SELECT o.*
        FROM orders o
        JOIN deliveries d ON d.order_id = o.id
        WHERE o.payment_method = 'cash_on_delivery'
            AND o.status = 'delivered'
            AND o.buyer_confirmed_at IS NULL
            AND d.delivered_at IS NOT NULL
            AND d.delivered_at <= (NOW() - INTERVAL ? HOUR)
            AND NOT EXISTS (
                SELECT 1 FROM disputes disp
                WHERE disp.order_id = o.id AND disp.status IN ('open', 'under_review')
            )`,
        [hours]
    );
    return rows;
};

// Set when a seller ships an order: 'platform' (open pool, any agent can
// claim) or 'own' (assigned directly to one of the seller's own agents).
exports.setDeliveryMode = async (orderId, mode) => {
    await db.query(
        "UPDATE orders SET delivery_mode = ? WHERE id = ?",
        [mode, orderId]
    );
};

exports.updatePaymentStatus = async (orderId, paymentStatus, executor = db) => {
    await executor.query(
        "UPDATE orders SET payment_status = ? WHERE id = ?",
        [paymentStatus, orderId]
    );
};

// Pre-order / made-to-order (Phase 8) - the three timestamps a pre-order
// order's payment lifecycle passes through, on top of the payment_status
// value itself. Kept separate from updatePaymentStatus (rather than
// folding a timestamp param into it) since only pre-order transitions
// ever set these - a standard order's single unpaid->paid jump never
// touches them.
exports.markDepositPaid = async (orderId, executor = db) => {
    await executor.query(
        "UPDATE orders SET payment_status = 'deposit_paid', deposit_paid_at = NOW() WHERE id = ?",
        [orderId]
    );
};

exports.markBalancePaid = async (orderId, executor = db) => {
    await executor.query(
        "UPDATE orders SET payment_status = 'paid', balance_paid_at = NOW() WHERE id = ?",
        [orderId]
    );
};

// Seller-triggered: "the item is ready, buyer needs to settle the
// balance" (order.service.js#requestPreorderBalance). Just a timestamp -
// doesn't touch payment_status - the buyer paying is what actually
// advances that.
exports.markBalanceRequested = async (orderId) => {
    await db.query(
        "UPDATE orders SET balance_requested_at = NOW() WHERE id = ?",
        [orderId]
    );
};

// A parent order is paid for once by the buyer, but each vendor child
// order tracks its own payment_status too (sellers/agents read it off
// their own order row) - this keeps them all in sync with the parent.
exports.updatePaymentStatusForChildren = async (parentOrderId, paymentStatus, executor = db) => {
    await executor.query(
        "UPDATE orders SET payment_status = ? WHERE parent_order_id = ?",
        [paymentStatus, parentOrderId]
    );
};

// (Backend N+1 Fixes & Read Replica Adoption): replaces what
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
// C1 (Phase 4 remediation): a paid order's wallet credit is applied
// fire-and-forget (see payment.service.js's creditSellersForOrder(...)
// .catch(...) calls) - if that background step throws, the seller
// otherwise has no way to know their payout for this order is stuck
// short of contacting support. wallet_credit_pending flags exactly that
// case: the order is paid (so crediting should have already run), the
// payment wasn't Cash on Delivery (COD has no wallet-credit step to get
// stuck), this seller still has at least one uncredited order_items row,
// and enough time has passed since the order last changed that a normal
// in-flight credit would have finished - this avoids flashing "pending"
// for the split-second window between payment confirmation and the
// async credit call actually completing.
// (UI/UX remediation) - status/search filtering, same
// treatment order.repository.js#findOrdersByBuyer already got in
// Phase 4. `q` matches the order number or any of this seller's own
// product names within the order (not another seller's items in a
// split order - oi.seller_id scopes that).
exports.findOrdersBySeller = async (sellerId, { status, q, sort } = {}) => {
    const conditions = ["oi.seller_id = ?", "(o.payment_method = 'cash_on_delivery' OR o.payment_status = 'paid')"];
    const params = [sellerId];

    if (status) {
        conditions.push("o.status = ?");
        params.push(status);
    }
    if (q) {
        conditions.push(
            `(o.order_number LIKE ? OR EXISTS (
                SELECT 1 FROM order_items oi3
                JOIN products p ON p.id = oi3.product_id
                WHERE oi3.order_id = o.id AND oi3.seller_id = ? AND p.name LIKE ?
            ))`
        );
        params.push(`%${q}%`, sellerId, `%${q}%`);
    }

    const orderByClause = resolveOrderSort(sort);

    const [rows] = await db.query(
        `SELECT DISTINCT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at,
                u.first_name AS buyer_first_name, u.last_name AS buyer_last_name,
                (SELECT p.name FROM order_items oi4
                    JOIN products p ON p.id = oi4.product_id
                    WHERE oi4.order_id = o.id AND oi4.seller_id = ?
                    ORDER BY oi4.id ASC LIMIT 1) AS primary_item_name,
                EXISTS (
                    SELECT 1 FROM order_items oi2
                    WHERE oi2.order_id = o.id AND oi2.seller_id = ? AND oi2.wallet_credited = FALSE
                ) AND o.payment_method != 'cash_on_delivery'
                  AND o.payment_status = 'paid'
                  AND o.updated_at < (NOW() - INTERVAL 10 MINUTE) AS wallet_credit_pending
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN users u ON u.id = o.buyer_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${orderByClause}`,
        [sellerId, sellerId, ...params]
    );
    return rows.map((row) => ({ ...row, wallet_credit_pending: !!row.wallet_credit_pending }));
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

// Order/item context for notification content (Phase 6, UI/UX
// remediation) - a single-order lookup for the notify() call sites that
// only have an orderId/order row in hand, not an item list already
// loaded in memory (checkout builds its own summary straight from the
// cart it just processed; cancelOrder/autoCancelStaleOrder/
// updateOrderStatusBySeller only ever fetched the order row itself).
// Mirrors the primary_item_name subquery already used by
// findOrdersByBuyer/findOrdersBySeller/findAllOrders (Phase 3) - first
// item added, by order_items.id - rather than introducing a second way
// of picking "the" item to name.
//
// Returns itemName: null for a multi-vendor parent order, since a split
// cart's items live on the child orders, not the parent row itself (see
// createSplitOrder's comment) - callers treat a null itemName as
// "nothing to name" and fall back to the order-number-only message,
// same as before this existed.
exports.getPrimaryItemSummary = async (orderId) => {
    const [rows] = await db.query(
        `SELECT
            (SELECT p.name FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = ? ORDER BY oi.id ASC LIMIT 1) AS itemName,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ?) AS itemCount`,
        [orderId, orderId]
    );
    return rows[0] || { itemName: null, itemCount: 0 };
};

// Exported for the unit tests and so a future re-consent flow can compare
// an order's stored version against the current one without duplicating
// the literal.
exports.CURRENT_CHECKOUT_TERMS_VERSION = CURRENT_CHECKOUT_TERMS_VERSION;
