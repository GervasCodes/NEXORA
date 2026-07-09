const adminRepository = require("./admin.repository");
const notificationService = require("../notification/notification.service");

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
