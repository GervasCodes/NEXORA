/**
 * Progressive KYC tiers (Phase Q1).
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
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

const TIER_ORDER = ["tier0", "tier1", "tier2"];
const NEXT_TIER = { tier0: "tier1", tier1: "tier2" };

exports.getMyStatus = async (userId) => {
    const [tier, limits, pendingRequest] = await Promise.all([
        kycRepository.getUserTier(userId),
        kycRepository.getTierLimits(),
        kycRepository.findPendingRequestForUser(userId)
    ]);

    if (!tier) {
        throw new Error("User not found");
    }

    return {
        tier,
        nextTier: NEXT_TIER[tier] || null,
        limits,
        pendingRequest: pendingRequest || null
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

    const uploaded = await uploadToCloudinary(file.buffer, "nexora/kyc", "auto");

    const id = await kycRepository.createRequest({
        userId,
        targetTier,
        documentType,
        fileUrl: uploaded.secure_url,
        note
    });

    return kycRepository.findById(id);
};

exports.listRequests = async (filter) => kycRepository.findByFilter(filter);

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

    return kycRepository.findById(requestId);
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

    return kycRepository.findById(requestId);
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

exports.TIER_ORDER = TIER_ORDER;
