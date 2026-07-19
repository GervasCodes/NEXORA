const accountVerificationRepository = require("./accountVerification.repository");
const notificationService = require("../notification/notification.service");

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

    // The paid "Verified Seller" badge requires both this approval and the
    // verification fee - re-check now in case the fee was already paid
    // before this approval came through (see seller.service's syncBadge).
    if (user.role === "seller") {
        const sellerService = require("../seller/seller.service");
        await sellerService.syncBadgeForSeller(userId).catch((err) =>
            console.error("badge sync error after account verification approval:", err)
        );
    }

    const roleLabel = user.role === "delivery_agent" ? "delivery" : "seller";
    await notificationService.notify({
        userId,
        type: "account_verification",
        titleKey: "notifications.verification.approved.title",
        messageKey: "notifications.verification.approved.message",
        messageParams: { role: roleLabel },
        withEmail: true
    }).catch((err) => console.error("verification approve notify error:", err));

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
    }).catch((err) => console.error("verification reject notify error:", err));

    return exports.getDetail(userId);
};
