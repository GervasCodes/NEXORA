/**
 * Buyer protection / return-shipping workflow (Phase Q1).
 *
 * State machine: requested -> approved -> shipped_back -> received -> refunded
 *                requested/approved -> rejected (seller/admin) or cancelled (buyer)
 *
 * A return can only be opened on a 'delivered' order, within
 * return_window_days of delivery (7 days by default, 14 if the order
 * purchased the checkout buyer-protection insurance add-on - see
 * order.service.js#checkout). Once 'received' is confirmed, a refund is
 * triggered automatically through refund.service.js (same
 * retry/idempotency machinery disputes already use), and any earnings
 * already released to the seller for the returned item(s) are reversed
 * from their wallet the same way dispute.service.js does.
 */

const db = require("../../config/db");
const returnRepository = require("./return.repository");
const orderRepository = require("../order/order.repository");
const deliveryRepository = require("../delivery/delivery.repository");
const walletRepository = require("../wallet/wallet.repository");
const notificationService = require("../notification/notification.service");
const refundService = require("../refund/refund.service");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const logger = require("../../utils/logger").child({ module: "return" });
const Sentry = require("../../config/sentry");

const DEFAULT_WINDOW_DAYS = 7;
const INSURED_WINDOW_DAYS = 14;
const REASONS = ["damaged_item", "wrong_item", "defective_product", "not_as_described", "changed_mind", "other"];

const assertParticipant = (ret, userId, role) => {
    if (!ret) throw new Error("Return not found");
    const isOwner = role === "buyer" && ret.buyer_id === userId;
    const isSeller = role === "seller" && ret.seller_id === userId;
    const isAdmin = role === "admin";
    if (!isOwner && !isSeller && !isAdmin) throw new Error("Return not found");
};

const getFullReturn = async (returnId) => {
    const ret = await returnRepository.findById(returnId);
    if (!ret) return null;
    const [history, evidence] = await Promise.all([
        returnRepository.findHistory(returnId),
        returnRepository.findEvidence(returnId)
    ]);
    return { ...ret, history, evidence };
};

// ---- Buyer: request a return -------------------------------------------

exports.requestReturn = async (buyerId, { order_id: orderId, order_item_id: orderItemId, reason, description }) => {
    if (!REASONS.includes(reason)) {
        throw new Error("Invalid return reason");
    }

    const order = await orderRepository.findOrderById(orderId);
    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }
    if (order.status !== "delivered") {
        throw new Error(`Only a delivered order can be returned (this one is "${order.status}")`);
    }

    const existing = await returnRepository.findOpenByOrderAndItem(orderId, orderItemId || null);
    if (existing) {
        throw new Error("There's already an open return request for this order");
    }

    let sellerId = null;
    if (orderItemId) {
        const items = await orderRepository.findOrderItems(orderId);
        const item = items.find((i) => i.id === Number(orderItemId));
        if (!item) throw new Error("Order item not found on this order");
        sellerId = item.seller_id;
    } else {
        const items = await orderRepository.findOrderItems(orderId);
        const sellerIds = new Set(items.map((i) => i.seller_id));
        // A whole-order return only makes sense for a single-vendor order -
        // a split cart's parent order has no items/seller of its own, and
        // each vendor's slice should be returned as its own child order.
        if (sellerIds.size === 1) {
            sellerId = items[0].seller_id;
        }
    }

    const windowDays = order.buyer_protection_addon ? INSURED_WINDOW_DAYS : DEFAULT_WINDOW_DAYS;

    const delivery = await deliveryRepository.findByOrderId(orderId);
    const deliveredAt = delivery?.delivered_at || order.updated_at;
    const deadline = new Date(new Date(deliveredAt).getTime() + windowDays * 24 * 60 * 60 * 1000);

    if (Date.now() > deadline.getTime()) {
        throw new Error(`The ${windowDays}-day return window for this order has passed`);
    }

    const returnId = await returnRepository.create({
        orderId,
        orderItemId: orderItemId || null,
        buyerId,
        sellerId,
        reason,
        description,
        returnWindowDays: windowDays
    });

    await returnRepository.addHistory(returnId, "requested", `Reason: ${reason}`, buyerId);

    if (sellerId) {
        await notificationService.notify({
            userId: sellerId,
            type: "return_requested",
            titleKey: "notifications.return.requested.title",
            messageKey: "notifications.return.requested.message",
            messageParams: { orderNumber: order.order_number },
            relatedOrderId: orderId,
            withEmail: true
        }).catch((err) => logger.warn({ err, returnId }, "return-requested seller notify error"));
    }

    return getFullReturn(returnId);
};

exports.cancelReturn = async (returnId, buyerId) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, buyerId, "buyer");

    if (!["requested", "approved"].includes(ret.status)) {
        throw new Error(`This return can no longer be cancelled (status: "${ret.status}")`);
    }

    await returnRepository.updateStatus(returnId, "cancelled");
    await returnRepository.addHistory(returnId, "cancelled", null, buyerId);

    return getFullReturn(returnId);
};

// ---- Seller/admin: approve or reject -----------------------------------

exports.approveReturn = async (returnId, actorId, role) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, actorId, role);

    if (ret.status !== "requested") {
        throw new Error(`Only a "requested" return can be approved (this one is "${ret.status}")`);
    }

    await returnRepository.updateStatus(returnId, "approved", { decidedBy: actorId });
    await returnRepository.addHistory(returnId, "approved", null, actorId);

    await notificationService.notify({
        userId: ret.buyer_id,
        type: "return_status",
        titleKey: "notifications.return.approved.title",
        messageKey: "notifications.return.approved.message",
        relatedOrderId: ret.order_id,
        withEmail: true
    }).catch((err) => logger.warn({ err, returnId }, "return approve notify error"));

    return getFullReturn(returnId);
};

exports.rejectReturn = async (returnId, actorId, role, reason) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, actorId, role);

    if (!["requested", "approved"].includes(ret.status)) {
        throw new Error(`This return can no longer be rejected (status: "${ret.status}")`);
    }
    if (!reason || !reason.trim()) {
        throw new Error("A rejection reason is required");
    }

    await returnRepository.updateStatus(returnId, "rejected", { rejectionReason: reason, decidedBy: actorId });
    await returnRepository.addHistory(returnId, "rejected", reason, actorId);

    await notificationService.notify({
        userId: ret.buyer_id,
        type: "return_status",
        titleKey: "notifications.return.rejected.title",
        messageKey: "notifications.return.rejected.message",
        messageParams: { reason },
        relatedOrderId: ret.order_id,
        withEmail: true
    }).catch((err) => logger.warn({ err, returnId }, "return reject notify error"));

    return getFullReturn(returnId);
};

// ---- Buyer: mark shipped back -------------------------------------------

exports.markShippedBack = async (returnId, buyerId, { tracking_number: trackingNumber, carrier }) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, buyerId, "buyer");

    if (ret.status !== "approved") {
        throw new Error(`This return must be approved before shipping it back (currently "${ret.status}")`);
    }
    if (!trackingNumber || !trackingNumber.trim()) {
        throw new Error("A tracking number is required");
    }

    await returnRepository.updateStatus(returnId, "shipped_back", { trackingNumber, carrier });
    await returnRepository.addHistory(returnId, "shipped_back", `Tracking: ${trackingNumber}`, buyerId);

    if (ret.seller_id) {
        await notificationService.notify({
            userId: ret.seller_id,
            type: "return_status",
            titleKey: "notifications.return.shippedBack.title",
            messageKey: "notifications.return.shippedBack.message",
            relatedOrderId: ret.order_id,
            withEmail: true
        }).catch((err) => logger.warn({ err, returnId }, "return shipped-back notify error"));
    }

    return getFullReturn(returnId);
};

// ---- Seller/admin: confirm received -> triggers refund -------------------

exports.markReceived = async (returnId, actorId, role) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, actorId, role);

    if (ret.status !== "shipped_back") {
        throw new Error(`This return hasn't been shipped back yet (status: "${ret.status}")`);
    }

    const order = await orderRepository.findOrderById(ret.order_id);
    const refundAmount = ret.order_item_id
        ? Number((await orderRepository.findOrderItems(ret.order_id)).find((i) => i.id === ret.order_item_id)?.subtotal || 0)
        : Number(order.total_amount);

    await returnRepository.updateStatus(returnId, "received", { markReceived: true, refundAmount });
    await returnRepository.addHistory(returnId, "received", null, actorId);

    if (ret.seller_id) {
        await reverseSellerEarningsForReturn(ret.seller_id, refundAmount, returnId).catch((err) => {
            logger.error({ err, returnId, sellerId: ret.seller_id }, "return wallet reversal error");
            Sentry.captureException(err, { tags: { area: "return", stage: "wallet-reversal" }, extra: { returnId } });
        });
    }

    refundService.autoRefundForReturn({ orderReturn: { ...ret, status: "received" }, amount: refundAmount, requestedBy: actorId })
        .catch((err) => {
            logger.error({ err, returnId }, "return auto-refund error");
            Sentry.captureException(err, { tags: { area: "return", stage: "auto-refund" }, extra: { returnId } });
        });

    await notificationService.notify({
        userId: ret.buyer_id,
        type: "return_status",
        titleKey: "notifications.return.received.title",
        messageKey: "notifications.return.received.message",
        messageParams: { amount: refundAmount },
        relatedOrderId: ret.order_id,
        withEmail: true
    }).catch((err) => logger.warn({ err, returnId }, "return received notify error"));

    return getFullReturn(returnId);
};

// Called by refund.service.js once the refund itself actually completes,
// so `order_returns.status` reflects reality even though the refund call
// is fire-and-forget from markReceived() above.
exports.markRefunded = async (returnId) => {
    await returnRepository.updateStatus(returnId, "refunded");
    await returnRepository.addHistory(returnId, "refunded", null, null);
};

// ---- Evidence (mirrors dispute.service.js's addEvidence) ----------------

exports.addEvidence = async (returnId, userId, role, file) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, userId, role);

    if (["rejected", "refunded", "cancelled"].includes(ret.status)) {
        throw new Error(`Evidence can't be added - this return is "${ret.status}"`);
    }
    if (!file) {
        throw new Error("No file uploaded");
    }

    const result = await uploadToCloudinary(file.buffer, "nexora/returns", "auto");
    await returnRepository.addEvidence(returnId, userId, result.secure_url);

    return getFullReturn(returnId);
};

// ---- Reads ----------------------------------------------------------------

exports.getDetail = async (returnId, userId, role) => {
    const ret = await returnRepository.findById(returnId);
    assertParticipant(ret, userId, role);
    return getFullReturn(returnId);
};

exports.getMyReturns = async (buyerId, query = {}) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

    const { returns, total } = await returnRepository.findByBuyer(buyerId, {
        status: query.status || null,
        from: query.from || null,
        to: query.to || null,
        q: query.q || null,
        page,
        limit
    });

    return {
        returns,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};
exports.getSellerReturns = async (sellerId) => returnRepository.findBySeller(sellerId);
exports.getAllReturns = async (filter) => returnRepository.findAll(filter);

// ---- Wallet reversal (mirrors dispute.service.js's reverseSellerEarnings) -

async function reverseSellerEarningsForReturn(sellerId, amount, returnId) {
    if (!amount || amount <= 0) return;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        const heldReversal = Math.min(amount, Math.max(Number(wallet.held_balance), 0));
        const balanceReversal = Number((amount - heldReversal).toFixed(2));

        if (heldReversal > 0) {
            const heldAfter = await walletRepository.incrementHeldBalance(sellerId, -heldReversal, connection);
            await walletRepository.insertTransaction({
                sellerId,
                type: "debit",
                amount: heldReversal,
                balanceAfter: heldAfter,
                referenceType: "return",
                referenceId: returnId,
                description: `Refund issued for return #${returnId} - held earnings reversed`
            }, connection);
        }

        if (balanceReversal > 0) {
            const balanceAfter = await walletRepository.incrementBalance(sellerId, -balanceReversal, connection);
            await walletRepository.insertTransaction({
                sellerId,
                type: "debit",
                amount: balanceReversal,
                balanceAfter,
                referenceType: "return",
                referenceId: returnId,
                description: `Refund issued for return #${returnId} - earnings reversed`
            }, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

exports.REASONS = REASONS;
exports.DEFAULT_WINDOW_DAYS = DEFAULT_WINDOW_DAYS;
exports.INSURED_WINDOW_DAYS = INSURED_WINDOW_DAYS;
