const adminRepository = require("./admin.repository");
const notificationService = require("../notification/notification.service");
const settingsService = require("../settings/settings.service");
const walletService = require("../wallet/wallet.service");

exports.listUsers = async () => {
    return adminRepository.findAllUsers();
};

exports.setUserActive = async (userId, isActive) => {
    const user = await adminRepository.findUserById(userId);

    if (!user) {
        throw new Error("User not found");
    }

    await adminRepository.setUserActive(userId, isActive);

    await notificationService.notify({
        userId,
        type: "account_status",
        title: isActive ? "Account reactivated" : "Account deactivated",
        message: isActive
            ? "Your account has been reactivated. Welcome back!"
            : "Your account has been deactivated. Contact support if you believe this is a mistake.",
        withEmail: true
    });
};

exports.listSellers = async () => {
    return adminRepository.findAllSellers();
};

exports.setSellerVerified = async (sellerUserId, isVerified) => {
    const profile = await adminRepository.findSellerProfileByUserId(sellerUserId);

    if (!profile) {
        throw new Error("Seller profile not found");
    }

    await adminRepository.setSellerVerified(sellerUserId, isVerified);

    await notificationService.notify({
        userId: sellerUserId,
        type: "seller_verification",
        title: isVerified ? "Store verified" : "Store verification removed",
        message: isVerified
            ? `Congratulations! "${profile.store_name}" has been verified.`
            : `Verification for "${profile.store_name}" has been removed.`,
        withEmail: true
    });
};

exports.listProducts = async () => {
    return adminRepository.findAllProducts();
};

exports.setProductActive = async (productId, isActive) => {
    const product = await adminRepository.findProductById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    await adminRepository.setProductActive(productId, isActive);

    await notificationService.notify({
        userId: product.seller_id,
        type: "product_moderation",
        title: isActive ? "Product reactivated" : "Product removed",
        message: isActive
            ? `Your product "${product.name}" is visible again.`
            : `Your product "${product.name}" was removed by an administrator for review.`,
        withEmail: true
    });
};

exports.listAllOrders = async () => {
    return adminRepository.findAllOrders();
};

exports.getDashboard = async () => {
    const { userCounts, orderCounts, revenue, productCounts } =
        await adminRepository.getDashboardStats();

    return {
        users: {
            buyers: Number(userCounts.buyers) || 0,
            sellers: Number(userCounts.sellers) || 0,
            delivery_agents: Number(userCounts.delivery_agents) || 0
        },
        orders: {
            total: Number(orderCounts.total_orders) || 0,
            pending: Number(orderCounts.pending_orders) || 0,
            delivered: Number(orderCounts.delivered_orders) || 0,
            cancelled: Number(orderCounts.cancelled_orders) || 0
        },
        revenue: Number(revenue.total_revenue) || 0,
        products: {
            total: Number(productCounts.total_products) || 0,
            active: Number(productCounts.active_products) || 0
        }
    };
};

// --- Platform settings (commission rate, rider delivery fee) ---

exports.getSettings = async () => {
    return settingsService.getAll();
};

exports.updateSettings = async (data) => {
    return settingsService.updateSettings(data);
};

// --- Seller withdrawal requests ---

exports.listWithdrawals = async () => {
    return walletService.listAllWithdrawals();
};

exports.approveWithdrawal = async (withdrawalId, adminNote) => {
    return walletService.processWithdrawal(withdrawalId, "approve", adminNote);
};

exports.rejectWithdrawal = async (withdrawalId, adminNote) => {
    return walletService.processWithdrawal(withdrawalId, "reject", adminNote);
};

exports.markWithdrawalPaid = async (withdrawalId, adminNote) => {
    return walletService.processWithdrawal(withdrawalId, "paid", adminNote);
};

// --- Seller verification review ---

exports.listPendingVerifications = async () => {
    return adminRepository.findPendingVerifications();
};

exports.getSellerVerificationDetail = async (sellerUserId) => {
    const profile = await adminRepository.findSellerProfileByUserId(sellerUserId);

    if (!profile) {
        throw new Error("Seller profile not found");
    }

    const documents = await adminRepository.findVerificationDocuments(sellerUserId);

    return { profile, documents };
};

exports.approveSellerVerification = async (sellerUserId) => {
    const profile = await adminRepository.findSellerProfileByUserId(sellerUserId);

    if (!profile) {
        throw new Error("Seller profile not found");
    }

    if (profile.verification_status !== "pending") {
        throw new Error(`This seller's verification is "${profile.verification_status}", not pending.`);
    }

    await adminRepository.setSellerVerificationStatus(sellerUserId, "approved");

    // Award the paid badge immediately if the seller already paid the fee.
    const sellerService = require("../seller/seller.service");
    await sellerService.syncBadgeForSeller(sellerUserId);

    await notificationService.notify({
        userId: sellerUserId,
        type: "seller_verification",
        title: "Verification approved",
        message: `Your documents have been approved. "${profile.store_name}" can now add and sell products.`,
        withEmail: true
    });
};

exports.rejectSellerVerification = async (sellerUserId, reason) => {
    const profile = await adminRepository.findSellerProfileByUserId(sellerUserId);

    if (!profile) {
        throw new Error("Seller profile not found");
    }

    if (profile.verification_status !== "pending") {
        throw new Error(`This seller's verification is "${profile.verification_status}", not pending.`);
    }

    await adminRepository.setSellerVerificationStatus(sellerUserId, "rejected", reason || null);

    await notificationService.notify({
        userId: sellerUserId,
        type: "seller_verification",
        title: "Verification rejected",
        message: reason
            ? `Your verification documents were rejected: ${reason}. You can resubmit corrected documents.`
            : "Your verification documents were rejected. You can resubmit corrected documents.",
        withEmail: true
    });
};

// --- Admin management (super admin only) ---

exports.listAdmins = async () => {
    return adminRepository.findAllAdmins();
};

exports.addAdmin = async (data) => {
    const authRepository = require("../auth/auth.repository");
    const hashPassword = require("../../utils/hashPassword");

    const { first_name, last_name, email, phone, password, admin_level } = data;

    if (await authRepository.findByEmail(email)) {
        throw new Error("Email already exists");
    }
    if (await authRepository.findByPhone(phone)) {
        throw new Error("Phone number already exists");
    }

    const hashedPassword = await hashPassword(password);

    const userId = await adminRepository.createAdmin({
        first_name,
        last_name,
        email,
        phone,
        password: hashedPassword,
        admin_level: admin_level === "super_admin" ? "super_admin" : "admin"
    });

    return { userId };
};

exports.updateAdminPermissions = async (userId, adminLevel) => {
    const admins = await adminRepository.findAllAdmins();
    const target = admins.find((a) => a.id === Number(userId));

    if (!target) {
        throw new Error("Admin not found");
    }

    if (target.admin_level === "super_admin" && adminLevel !== "super_admin") {
        const superAdminCount = await adminRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
            throw new Error("Can't demote the last super admin.");
        }
    }

    await adminRepository.updateAdminLevel(userId, adminLevel);
};

exports.removeAdmin = async (userId, requestingAdminId) => {
    if (Number(userId) === Number(requestingAdminId)) {
        throw new Error("You can't remove your own admin access.");
    }

    const admins = await adminRepository.findAllAdmins();
    const target = admins.find((a) => a.id === Number(userId));

    if (!target) {
        throw new Error("Admin not found");
    }

    if (target.admin_level === "super_admin") {
        const superAdminCount = await adminRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
            throw new Error("Can't remove the last super admin.");
        }
    }

    await adminRepository.revokeAdmin(userId);
};
