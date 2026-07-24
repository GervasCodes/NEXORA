const db = require("../../config/db");
const disputeRepository = require("./dispute.repository");
const orderRepository = require("../order/order.repository");
const walletRepository = require("../wallet/wallet.repository");
const notificationService = require("../notification/notification.service");
const refundService = require("../refund/refund.service");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

const generateDisputeNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `DSP-${timestamp}-${random}`;
};

// Orders in these statuses were never actually fulfilled to the buyer,
// so none of the five dispute categories make sense yet.
const NOT_YET_DISPUTABLE_STATUSES = ["pending", "cancelled"];

const TYPE_LABELS = {
    damaged_item: "Damaged item",
    delayed_delivery: "Delayed delivery",
    defective_product: "Defective product",
    wrong_item: "Wrong item",
    missing_delivery: "Missing delivery",
    other: "Other issue"
};

// ---- Helpers ----------------------------------------------------------

const assertParticipant = (dispute, userId, role) => {
    if (!dispute) {
        throw new Error("Dispute not found");
    }
    if (role === "admin") return;
    if (role === "buyer" && dispute.buyer_id === userId) return;
    if (role === "seller" && dispute.seller_id === userId) return;

    throw new Error("You do not have access to this dispute");
};

const getFullDispute = async (disputeId) => {
    const dispute = await disputeRepository.findById(disputeId);
    if (!dispute) {
        throw new Error("Dispute not found");
    }

    const [evidence, messages, history] = await Promise.all([
        disputeRepository.findEvidence(disputeId),
        disputeRepository.findMessages(disputeId),
        disputeRepository.findHistory(disputeId)
    ]);

    return { ...dispute, evidence, messages, history };
};

// ---- Buyer: create dispute ---------------------------------------------

exports.createDispute = async (buyerId, { order_id, order_item_id, type, subject, description }) => {
    if (!TYPE_LABELS[type]) {
        throw new Error("Invalid dispute type");
    }

    const order = await orderRepository.findOrderById(order_id);
    if (!order || order.buyer_id !== buyerId) {
        throw new Error("Order not found");
    }
    if (NOT_YET_DISPUTABLE_STATUSES.includes(order.status)) {
        throw new Error(`This order is "${order.status}" and can't be disputed yet`);
    }
    if (order.payment_status !== "paid" && order.payment_method !== "cash_on_delivery") {
        throw new Error("This order hasn't been paid for yet");
    }

    let sellerId = null;
    if (order_item_id) {
        const items = await orderRepository.findOrderItems(order_id);
        const item = items.find((i) => i.id === Number(order_item_id));
        if (!item) {
            throw new Error("That item does not belong to this order");
        }
        sellerId = item.seller_id;
    } else {
        // Whole-order issues (e.g. missing/delayed delivery) - orders are
        // single-seller by construction, so this still resolves cleanly.
        sellerId = await orderRepository.findOrderSellerId(order_id);
    }

    const existing = await disputeRepository.findOpenByOrderAndItem(order_id, order_item_id);
    if (existing) {
        throw new Error("There is already an open dispute for this order/item");
    }

    const disputeNumber = generateDisputeNumber();

    const disputeId = await disputeRepository.create({
        disputeNumber,
        orderId: order_id,
        orderItemId: order_item_id || null,
        buyerId,
        sellerId,
        type,
        subject,
        description
    });

    await disputeRepository.addHistory(disputeId, "opened", `Filed as ${TYPE_LABELS[type]}`, buyerId);

    if (sellerId) {
        await notificationService.notify({
            userId: sellerId,
            type: "dispute",
            titleKey: "notifications.dispute.new.title",
            messageKey: "notifications.dispute.new.message",
            messageParams: {
                disputeNumber,
                orderNumber: order.order_number,
                type: { key: `labels.disputeType.${type}` }
            },
            relatedOrderId: order_id,
            withEmail: true
        }).catch((err) => console.error("dispute create seller notify error:", err));
    }

    return getFullDispute(disputeId);
};

// ---- Evidence -----------------------------------------------------------

exports.addEvidence = async (disputeId, userId, role, file) => {
    const dispute = await disputeRepository.findById(disputeId);
    assertParticipant(dispute, userId, role);

    if (!["open", "under_review"].includes(dispute.status)) {
        throw new Error(`Evidence can't be added - this dispute is "${dispute.status}"`);
    }
    if (!file) {
        throw new Error("No file uploaded");
    }

    const result = await uploadToCloudinary(file.buffer, "nexora/disputes", "auto");
    await disputeRepository.addEvidence(disputeId, userId, result.secure_url);

    return getFullDispute(disputeId);
};

// ---- Messages -------------------------------------------------------------

exports.addMessage = async (disputeId, userId, role, message) => {
    const dispute = await disputeRepository.findById(disputeId);
    assertParticipant(dispute, userId, role);

    if (!message || !message.trim()) {
        throw new Error("Message can't be empty");
    }
    if (["resolved", "rejected", "withdrawn"].includes(dispute.status)) {
        throw new Error(`This dispute is already "${dispute.status}" and closed for new messages`);
    }

    await disputeRepository.addMessage(disputeId, userId, role, message.trim());

    // Seller replying to an open dispute moves it into review automatically,
    // so it surfaces in the admin's "needs a decision" queue.
    if (role === "seller" && dispute.status === "open") {
        await disputeRepository.updateStatus(disputeId, "under_review");
        await disputeRepository.addHistory(disputeId, "under_review", "Seller responded", userId);
    }

    const notifyUserId = role === "buyer" ? dispute.seller_id : dispute.buyer_id;
    if (notifyUserId) {
        notificationService.notify({
            userId: notifyUserId,
            type: "dispute",
            titleKey: "notifications.dispute.newMessage.title",
            messageKey: "notifications.dispute.newMessage.message",
            messageParams: { disputeNumber: dispute.dispute_number },
            relatedOrderId: dispute.order_id,
            withEmail: false
        }).catch((err) => console.error("dispute message notify error:", err));
    }

    return getFullDispute(disputeId);
};

// ---- Read ---------------------------------------------------------------

exports.getDisputeDetail = async (disputeId, userId, role) => {
    const dispute = await disputeRepository.findById(disputeId);
    assertParticipant(dispute, userId, role);
    return getFullDispute(disputeId);
};

exports.getMyDisputes = async (buyerId) => disputeRepository.findByBuyer(buyerId);

exports.getSellerDisputes = async (sellerId) => disputeRepository.findBySeller(sellerId);

exports.getAllDisputes = async (filter) => disputeRepository.findAll(filter);

// ---- Buyer: withdraw ------------------------------------------------------

exports.withdrawDispute = async (disputeId, buyerId) => {
    const dispute = await disputeRepository.findById(disputeId);
    assertParticipant(dispute, buyerId, "buyer");

    if (!["open", "under_review"].includes(dispute.status)) {
        throw new Error(`This dispute is already "${dispute.status}"`);
    }

    await disputeRepository.updateStatus(disputeId, "withdrawn");
    await disputeRepository.addHistory(disputeId, "withdrawn", null, buyerId);

    return getFullDispute(disputeId);
};

// ---- Admin: move to review -------------------------------------------------

exports.markUnderReview = async (disputeId, adminId) => {
    const dispute = await disputeRepository.findById(disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status !== "open") {
        throw new Error(`Only an "open" dispute can be moved to review (this one is "${dispute.status}")`);
    }

    await disputeRepository.updateStatus(disputeId, "under_review");
    await disputeRepository.addHistory(disputeId, "under_review", "Admin picked up for review", adminId);

    return getFullDispute(disputeId);
};

// ---- Admin: resolve ---------------------------------------------------------

const RESOLUTIONS = ["refund_full", "refund_partial", "replacement", "compensation", "no_action"];

exports.resolveDispute = async (disputeId, adminId, { resolution, resolution_note, refund_amount }) => {
    if (!RESOLUTIONS.includes(resolution)) {
        throw new Error("Invalid resolution type");
    }

    const dispute = await disputeRepository.findById(disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (!["open", "under_review"].includes(dispute.status)) {
        throw new Error(`This dispute is already "${dispute.status}"`);
    }

    const needsRefundAmount = resolution === "refund_full" || resolution === "refund_partial";
    let refundAmount = null;

    if (needsRefundAmount) {
        const order = await orderRepository.findOrderById(dispute.order_id);
        const orderTotal = Number(order.total_amount);

        refundAmount = resolution === "refund_full"
            ? orderTotal
            : Number(refund_amount);

        if (!refundAmount || refundAmount <= 0) {
            throw new Error("A positive refund_amount is required for a partial refund");
        }
        if (refundAmount > orderTotal) {
            throw new Error("Refund amount can't exceed the order total");
        }
    }

    await disputeRepository.resolve(disputeId, {
        status: "resolved",
        resolution,
        resolutionNote: resolution_note,
        refundAmount,
        resolvedBy: adminId
    });
    await disputeRepository.addHistory(
        disputeId,
        "resolved",
        `${resolution}${refundAmount ? ` (${refundAmount})` : ""}${resolution_note ? ` - ${resolution_note}` : ""}`,
        adminId
    );

    // A refund reverses money the seller was already paid out for this
    // order's items (wallet.service credits net-of-commission earnings on
    // payment confirmation) - debit their wallet for the refunded amount
    // so their balance reflects reality. Best-effort: if their wallet
    // doesn't have a row yet (nothing was ever credited) there's simply
    // nothing to reverse here - the refund itself is still recorded on
    // the dispute for the admin's own manual payout process.
    if (needsRefundAmount && dispute.seller_id) {
        await reverseSellerEarnings(dispute.seller_id, refundAmount, disputeId).catch((err) =>
            console.error("dispute wallet reversal error:", err)
        );
    }

    // Push the buyer's money back automatically (Phase 2 - Refund
    // Automation). Fire-and-forget, same pattern as the wallet reversal
    // above and notifyResolution() below - the admin's resolve request
    // shouldn't block on a payment-gateway round trip. refund.service.js
    // handles idempotency (one refund per dispute), retries, and audit
    // logging on its own; a failure here just leaves the refund in
    // 'failed'/'manual_required' for an admin to retry from the refunds
    // dashboard, it never breaks the dispute resolution itself.
    if (needsRefundAmount) {
        refundService.autoRefundForDispute({ dispute, amount: refundAmount, requestedBy: adminId }).catch((err) =>
            console.error("dispute auto-refund error:", err)
        );
    }

    await notifyResolution(dispute, resolution, resolution_note, refundAmount);

    return getFullDispute(disputeId);
};

exports.rejectDispute = async (disputeId, adminId, { resolution_note }) => {
    const dispute = await disputeRepository.findById(disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (!["open", "under_review"].includes(dispute.status)) {
        throw new Error(`This dispute is already "${dispute.status}"`);
    }
    if (!resolution_note || !resolution_note.trim()) {
        throw new Error("A reason is required to reject a dispute");
    }

    await disputeRepository.resolve(disputeId, {
        status: "rejected",
        resolution: "no_action",
        resolutionNote: resolution_note,
        refundAmount: null,
        resolvedBy: adminId
    });
    await disputeRepository.addHistory(disputeId, "rejected", resolution_note, adminId);

    await notificationService.notify({
        userId: dispute.buyer_id,
        type: "dispute",
        titleKey: "notifications.dispute.rejected.title",
        messageKey: "notifications.dispute.rejected.message",
        messageParams: { disputeNumber: dispute.dispute_number, reason: resolution_note },
        relatedOrderId: dispute.order_id,
        withEmail: true
    }).catch((err) => console.error("dispute reject notify error:", err));

    return getFullDispute(disputeId);
};

// ---- Internal helpers -------------------------------------------------------

// A refund reverses money the seller was already credited for this
// order's items. As of Phase 9C, that credit could be sitting in either
// wallet column depending on how far along it is: still `held_balance`
// (order paid by an escrowed method, not yet released - see
// wallet.service.js#creditSellersForOrder) or already-withdrawable
// `balance` (Cash on Delivery, which was never held, or an escrowed
// order whose hold period already elapsed). Reverse from `held_balance`
// first, spilling any remainder into `balance` - this is a correct,
// order-agnostic strategy because it reverses money from wherever it
// currently sits in the seller's wallet, not from a specific order's
// entry. `balance` can still go negative if the spillover exceeds it
// (same as before this phase - no floor check here, unlike
// requestWithdrawal's explicit balance check), but reversing held funds
// first means that only happens once a seller's *already-released*
// earnings are outrun, which is a meaningfully smaller window than
// today's "immediately withdrawable the moment payment clears."
async function reverseSellerEarnings(sellerId, amount, disputeId) {
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
                referenceType: "dispute",
                referenceId: disputeId,
                description: `Refund issued for dispute #${disputeId} - held earnings reversed`
            }, connection);
        }

        if (balanceReversal > 0) {
            const balanceAfter = await walletRepository.incrementBalance(sellerId, -balanceReversal, connection);

            await walletRepository.insertTransaction({
                sellerId,
                type: "debit",
                amount: balanceReversal,
                balanceAfter,
                referenceType: "dispute",
                referenceId: disputeId,
                description: `Refund issued for dispute #${disputeId} - earnings reversed`
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

async function notifyResolution(dispute, resolution, resolutionNote, refundAmount) {
    const noteSuffix = resolutionNote ? { key: "notifications.dispute.resolved.noteSuffix", params: { note: resolutionNote } } : "";

    await notificationService.notify({
        userId: dispute.buyer_id,
        type: "dispute",
        titleKey: "notifications.dispute.resolved.title",
        messageKey: refundAmount ? "notifications.dispute.resolved.buyerWithRefund" : "notifications.dispute.resolved.buyerNoRefund",
        messageParams: {
            disputeNumber: dispute.dispute_number,
            resolution: { key: `labels.resolution.${resolution}` },
            amount: refundAmount,
            noteSuffix
        },
        relatedOrderId: dispute.order_id,
        withEmail: true
    }).catch((err) => console.error("dispute resolve buyer notify error:", err));

    if (dispute.seller_id) {
        const refundNote = refundAmount ? { key: "notifications.dispute.resolved.refundNote", params: { amount: refundAmount } } : "";

        await notificationService.notify({
            userId: dispute.seller_id,
            type: "dispute",
            titleKey: "notifications.dispute.resolved.title",
            messageKey: "notifications.dispute.resolved.sellerMessage",
            messageParams: {
                disputeNumber: dispute.dispute_number,
                resolution: { key: `labels.resolution.${resolution}` },
                refundNote
            },
            relatedOrderId: dispute.order_id,
            withEmail: true
        }).catch((err) => console.error("dispute resolve seller notify error:", err));
    }
}
