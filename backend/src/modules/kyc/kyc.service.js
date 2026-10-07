/**
 * Progressive KYC tiers .
 *
 * Every buyer starts at 'tier0' (light signup - just the normal
 * register flow, no documents). Placing an order above a tier's
 * max_order_amount requires stepping up: tier1 needs an ID document,
 * tier2 needs a proof-of-address document. Upgrade requests go through
 * an admin review queue, mirroring accountVerification's approve/reject
 * shape (single pending request at a time, reviewed by an admin,
 * rejection requires a reason).
 *
 * enforceOrderLimit() is the actual enforcement point, called from
 * order.service.js#checkout before an order is created.
 */

const kycRepository = require("./kyc.repository");
const notificationService = require("../notification/notification.service");
const { uploadPrivateDocument, toClientDocument } = require("../../utils/privateDocuments");

const TIER_ORDER = ["tier0", "tier1", "tier2"];
const NEXT_TIER = { tier0: "tier1", tier1: "tier2" };

exports.getMyStatus = async (userId) => {
    const [tier, limits, pendingRequest, latestRequest] = await Promise.all([
        kycRepository.getUserTier(userId),
        kycRepository.getTierLimits(),
        kycRepository.findPendingRequestForUser(userId),
        kycRepository.findLatestRequestForUser(userId)
    ]);

    if (!tier) {
        throw new Error("User not found");
    }

    // (Phase 4 remediation) - previously the only request ever
    // surfaced here was a *pending* one; a rejected request simply
    // vanished from this response, so a buyer whose upload was
    // rejected saw the plain "Upgrade to tierX" form again with no
    // indication anything had been tried before, let alone why it
    // didn't go through. Only surfaced when it's actually the latest
    // request and actually rejected - an approved or superseded-by-a-
    // newer-pending one shouldn't show as "rejected" here.
    const rejectedRequest = latestRequest && latestRequest.status === "rejected" && !pendingRequest
        ? latestRequest
        : null;

    return {
        tier,
        nextTier: NEXT_TIER[tier] || null,
        limits,
        pendingRequest: pendingRequest ? toClientDocument(pendingRequest) : null,
        rejectedRequest: rejectedRequest ? toClientDocument(rejectedRequest) : null
    };
};

// Buyer submits a document to move to the next tier up. targetTier must
// be exactly one step above their current tier - can't skip tier1 to
// request tier2 directly, and can't request a tier they're already at
// or below.
exports.requestUpgrade = async (userId, { documentType, note }, file) => {
    if (!file) {
        throw new Error("A document upload is required to request a tier upgrade");
    }

    const currentTier = await kycRepository.getUserTier(userId);
    const targetTier = NEXT_TIER[currentTier];

    if (!targetTier) {
        throw new Error(`Already at the highest KYC tier ("${currentTier}")`);
    }

    const existing = await kycRepository.findPendingRequestForUser(userId);
    if (existing) {
        throw new Error("You already have a pending KYC upgrade request");
    }

    if (!documentType || !documentType.trim()) {
        throw new Error("A document type is required");
    }

    const stored = await uploadPrivateDocument(file.buffer, "nexora/kyc");

    const id = await kycRepository.createRequest({
        userId,
        targetTier,
        documentType,
        stored,
        note
    });

    return toClientDocument(await kycRepository.findById(id));
};

exports.listRequests = async (filter) => (await kycRepository.findByFilter(filter)).map(toClientDocument);

exports.approve = async (requestId, adminId) => {
    const request = await kycRepository.findById(requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") {
        throw new Error(`This request is already "${request.status}"`);
    }

    await kycRepository.setRequestStatus(requestId, "approved", { reviewedBy: adminId });
    await kycRepository.setUserTier(request.user_id, request.target_tier);

    await notificationService.notify({
        userId: request.user_id,
        type: "kyc_upgrade",
        titleKey: "notifications.kyc.approved.title",
        messageKey: "notifications.kyc.approved.message",
        messageParams: { tier: { key: `labels.kycTier.${request.target_tier}` } },
        withEmail: true
    }).catch(() => {});

    return toClientDocument(await kycRepository.findById(requestId));
};

exports.reject = async (requestId, reason, adminId) => {
    const request = await kycRepository.findById(requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") {
        throw new Error(`This request is already "${request.status}"`);
    }
    if (!reason || !reason.trim()) {
        throw new Error("A rejection reason is required");
    }

    await kycRepository.setRequestStatus(requestId, "rejected", { rejectionReason: reason, reviewedBy: adminId });

    await notificationService.notify({
        userId: request.user_id,
        type: "kyc_upgrade",
        titleKey: "notifications.kyc.rejected.title",
        messageKey: "notifications.kyc.rejected.message",
        messageParams: { reason },
        withEmail: true
    }).catch(() => {});

    return toClientDocument(await kycRepository.findById(requestId));
};

// Called from order.service.js#checkout with the buyer's id and the
// order total about to be charged. Throws if it exceeds their tier's
// cap - the caller surfaces that as a normal checkout validation error.
exports.enforceOrderLimit = async (userId, orderAmount) => {
    const tier = await kycRepository.getUserTier(userId);
    const limit = await kycRepository.getTierLimit(tier || "tier0");

    if (!limit || limit.max_order_amount === null) {
        return; // unlimited (tier2)
    }

    if (Number(orderAmount) > Number(limit.max_order_amount)) {
        const nextTier = NEXT_TIER[tier];
        const upgradeHint = nextTier
            ? ` Verify your identity to raise your limit.`
            : "";
        throw new Error(
            `This order (${orderAmount}) exceeds your account's verification limit of ${limit.max_order_amount}.${upgradeHint}`
        );
    }
};

// ---- Cash on Delivery limits (Phase 2) ------------------------------------
// COD carries more risk than a prepaid order (no payment confirmation until
// the moment of delivery), so it gets its own, stricter checks on top of
// enforceOrderLimit above - all three called from order.service.js#checkout
// only when the buyer picked "cash_on_delivery".

exports.enforceCodOrderLimit = async (userId, orderAmount) => {
    const tier = await kycRepository.getUserTier(userId);
    const limit = await kycRepository.getCodTierLimit(tier || "tier0");
    if (!limit) return;

    const cap = limit.max_cod_order_amount !== null
        ? Number(limit.max_cod_order_amount)
        : (limit.max_order_amount !== null ? Number(limit.max_order_amount) : null);

    if (cap !== null && Number(orderAmount) > cap) {
        throw new Error(
            `This Cash on Delivery order (${orderAmount}) exceeds your account's Cash on Delivery limit of ${cap}. Pay online instead, or verify your identity to raise your limit.`
        );
    }
};

exports.enforceUnpaidCodLimit = async (userId) => {
    const tier = await kycRepository.getUserTier(userId);
    const limit = await kycRepository.getCodTierLimit(tier || "tier0");
    const max = limit && limit.max_unpaid_cod_orders !== null ? Number(limit.max_unpaid_cod_orders) : null;
    if (max === null) return;

    const current = await kycRepository.countUnpaidCodOrders(userId);
    if (current >= max) {
        throw new Error(
            `You already have ${current} Cash on Delivery order(s) awaiting delivery. Please receive or cancel one of them before placing another, or pay online instead.`
        );
    }
};

exports.enforceCodNotBlocked = async (userId) => {
    const settingsService = require("../settings/settings.service");
    const [refusedCount, blockAfter] = await Promise.all([
        kycRepository.getRefusedCodCount(userId),
        settingsService.getCodBlockAfterRefusedCount()
    ]);

    if (refusedCount >= blockAfter) {
        throw new Error("Cash on Delivery is no longer available on your account due to repeated refused deliveries. Please pay online instead.");
    }
};

exports.TIER_ORDER = TIER_ORDER;
