const db = require("../../config/db");
const accountVerificationRepository = require("./accountVerification.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const { classify } = require("../../utils/fileContentValidator");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "accountVerification" });
const Sentry = require("../../config/sentry");

exports.list = async (filter) => accountVerificationRepository.findByFilter(filter);

exports.getDetail = async (userId) => {
    const user = await accountVerificationRepository.findUserById(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const [documents, history] = await Promise.all([
        accountVerificationRepository.findDocumentsByUser(userId),
        accountVerificationRepository.findHistoryByUser(userId)
    ]);

    return { ...user, documents, history };
};

exports.approve = async (userId, adminId) => {
    const user = await accountVerificationRepository.findUserById(userId);
    if (!user) {
        throw new Error("User not found");
    }
    if (user.account_verification_status !== "pending") {
        throw new Error(`This account's verification is "${user.account_verification_status}", not pending.`);
    }

    await accountVerificationRepository.setStatus(userId, "approved", { actorAdminId: adminId });
    await accountVerificationRepository.insertHistory(userId, "approved", null, adminId);

    // Approval is what makes a seller "id_verified" (the free Verified
    // Seller badge). syncBadge reconciles the badge itself.
    if (user.role === "seller") {
        await accountVerificationRepository.promoteToIdVerified(userId);

        const sellerService = require("../seller/seller.service");
        await sellerService.syncBadgeForSeller(userId).catch((err) => {
            logger.error({ err, userId }, "badge sync error after account verification approval");
            Sentry.captureException(err, { tags: { area: "accountVerification", stage: "badge-sync" }, extra: { userId } });
        });
    }

    const roleLabel = user.role === "delivery_agent" ? "delivery" : "seller";
    await notificationService.notify({
        userId,
        type: "account_verification",
        titleKey: "notifications.verification.approved.title",
        messageKey: "notifications.verification.approved.message",
        messageParams: { role: roleLabel },
        withEmail: true
    }).catch((err) => logger.warn({ err, userId }, "verification approve notify error"));

    return exports.getDetail(userId);
};

exports.reject = async (userId, reason, adminId) => {
    const user = await accountVerificationRepository.findUserById(userId);
    if (!user) {
        throw new Error("User not found");
    }
    if (user.account_verification_status !== "pending") {
        throw new Error(`This account's verification is "${user.account_verification_status}", not pending.`);
    }
    if (!reason || !reason.trim()) {
        throw new Error("A rejection reason is required.");
    }

    await accountVerificationRepository.setStatus(userId, "rejected", { reason, actorAdminId: adminId });
    await accountVerificationRepository.insertHistory(userId, "rejected", reason, adminId);

    const roleLabel = user.role === "delivery_agent" ? "delivery" : "seller";
    await notificationService.notify({
        userId,
        type: "account_verification",
        titleKey: "notifications.verification.rejected.title",
        messageKey: "notifications.verification.rejected.message",
        messageParams: { role: roleLabel, reason },
        withEmail: true
    }).catch((err) => logger.warn({ err, userId }, "verification reject notify error"));

    return exports.getDetail(userId);
};

// --- Verified Business tier upgrade (id_verified -> business_verified) ---
//
// Mirrors the base flow above: one pending request per seller at a time,
// admin approves or rejects (rejection needs a reason), everything lands
// in the same history trail. All three documents are mandatory and must
// be real PDFs.

const BUSINESS_DOC_FIELDS = ["brela_certificate", "tin_certificate", "business_license"];
exports.BUSINESS_DOC_FIELDS = BUSINESS_DOC_FIELDS;

const BUSINESS_DOC_LABELS = {
    brela_certificate: "BRELA certificate",
    tin_certificate: "TIN certificate",
    business_license: "business license"
};

// The upload middleware already rejects non-PDFs, but the service is the
// last line of defense for any caller that doesn't go through it.
const assertPdf = (file, field) => {
    const label = BUSINESS_DOC_LABELS[field];
    if (!file) {
        throw new Error(`Please upload your ${label}.`);
    }
    if (file.mimetype !== "application/pdf" || classify(file.buffer)?.ext !== "pdf") {
        throw new Error(`Your ${label} must be uploaded as a PDF document, not a photo or image.`);
    }
};

exports.getBusinessStatus = async (userId) => {
    const user = await accountVerificationRepository.findUserById(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const latest = await accountVerificationRepository.findLatestBusinessRequestByUser(userId);

    return {
        verification_tier: user.verification_tier,
        can_apply:
            user.role === "seller" &&
            user.account_verification_status === "approved" &&
            user.verification_tier === "id_verified" &&
            latest?.status !== "pending",
        latest_request: latest
            ? {
                id: latest.id,
                status: latest.status,
                rejection_reason: latest.rejection_reason,
                submitted_at: latest.submitted_at,
                reviewed_at: latest.reviewed_at
            }
            : null
    };
};

exports.submitBusinessRequest = async (userId, files = {}) => {
    const user = await accountVerificationRepository.findUserById(userId);
    if (!user) {
        throw new Error("User not found");
    }
    if (user.role !== "seller") {
        throw new Error("Only sellers can apply for Verified Business status.");
    }
    if (user.account_verification_status !== "approved" || user.verification_tier === "none") {
        throw new Error("Complete your ID verification before applying for Verified Business status.");
    }
    if (user.verification_tier === "business_verified") {
        throw new Error("Your business is already verified.");
    }

    const documents = BUSINESS_DOC_FIELDS.map((field) => {
        const file = files?.[field]?.[0];
        assertPdf(file, field);
        return { type: field, file };
    });

    // Upload everything before touching the database, same as
    // registration: a failed upload leaves no half-created request.
    const uploaded = [];
    for (const doc of documents) {
        try {
            const result = await uploadToCloudinary(doc.file.buffer, `verification/${doc.type}`, "auto");
            uploaded.push({ type: doc.type, url: result.secure_url });
        } catch (uploadError) {
            throw new Error(`We couldn't upload your ${BUSINESS_DOC_LABELS[doc.type]}. Please try again.`);
        }
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await accountVerificationRepository.lockUser(userId, connection);

        const pending = await accountVerificationRepository.findPendingBusinessRequestByUser(userId, connection);
        if (pending) {
            throw new Error("You already have a Verified Business request under review.");
        }

        const requestId = await accountVerificationRepository.insertBusinessRequest(userId, connection);
        for (const doc of uploaded) {
            await accountVerificationRepository.insertBusinessDocument(userId, requestId, doc.type, doc.url, connection);
        }
        await accountVerificationRepository.insertHistory(userId, "business_submitted", null, null, connection);

        await connection.commit();
        return exports.getBusinessStatus(userId);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.listBusinessRequests = async ({ status } = {}) =>
    accountVerificationRepository.findBusinessRequestsByStatus(status || "pending");

exports.getBusinessRequestDetail = async (requestId) => {
    const request = await accountVerificationRepository.findBusinessRequestById(requestId);
    if (!request) {
        throw new Error("Request not found");
    }
    const documents = await accountVerificationRepository.findDocumentsByBusinessRequest(requestId);
    return { ...request, documents };
};

exports.approveBusinessRequest = async (requestId, adminId) => {
    const request = await accountVerificationRepository.findBusinessRequestById(requestId);
    if (!request) {
        throw new Error("Request not found");
    }
    if (request.status !== "pending") {
        throw new Error(`This request is "${request.status}", not pending.`);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const changed = await accountVerificationRepository.setBusinessRequestStatus(
            requestId, "approved", { actorAdminId: adminId }, connection
        );
        if (!changed) {
            throw new Error("This request has already been reviewed.");
        }

        await accountVerificationRepository.setVerificationTier(request.user_id, "business_verified", connection);
        await accountVerificationRepository.setBusinessBadge(request.user_id, true, connection);
        await accountVerificationRepository.insertHistory(request.user_id, "business_approved", null, adminId, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    await notificationService.notify({
        userId: request.user_id,
        type: "account_verification",
        titleKey: "notifications.verification.businessApproved.title",
        messageKey: "notifications.verification.businessApproved.message",
        withEmail: true
    }).catch((err) => logger.warn({ err, userId: request.user_id }, "business verification approve notify error"));

    return exports.getBusinessRequestDetail(requestId);
};

exports.rejectBusinessRequest = async (requestId, reason, adminId) => {
    if (!reason || !reason.trim()) {
        throw new Error("A rejection reason is required.");
    }

    const request = await accountVerificationRepository.findBusinessRequestById(requestId);
    if (!request) {
        throw new Error("Request not found");
    }
    if (request.status !== "pending") {
        throw new Error(`This request is "${request.status}", not pending.`);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const changed = await accountVerificationRepository.setBusinessRequestStatus(
            requestId, "rejected", { reason, actorAdminId: adminId }, connection
        );
        if (!changed) {
            throw new Error("This request has already been reviewed.");
        }

        // Rejection never touches the seller's existing tier/badge - they
        // stay id_verified and may submit a fresh request.
        await accountVerificationRepository.insertHistory(request.user_id, "business_rejected", reason, adminId, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    await notificationService.notify({
        userId: request.user_id,
        type: "account_verification",
        titleKey: "notifications.verification.businessRejected.title",
        messageKey: "notifications.verification.businessRejected.message",
        messageParams: { reason },
        withEmail: true
    }).catch((err) => logger.warn({ err, userId: request.user_id }, "business verification reject notify error"));

    return exports.getBusinessRequestDetail(requestId);
};
