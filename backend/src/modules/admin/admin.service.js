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
        titleKey: isActive ? "notifications.account.reactivated.title" : "notifications.account.deactivated.title",
        messageKey: isActive ? "notifications.account.reactivated.message" : "notifications.account.deactivated.message",
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
        titleKey: isVerified ? "notifications.seller.storeVerified.title" : "notifications.seller.storeUnverified.title",
        messageKey: isVerified ? "notifications.seller.storeVerified.message" : "notifications.seller.storeUnverified.message",
        messageParams: { storeName: profile.store_name },
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
        titleKey: isActive ? "notifications.product.reactivated.title" : "notifications.product.removed.title",
        messageKey: isActive ? "notifications.product.reactivated.message" : "notifications.product.removed.message",
        messageParams: { productName: product.name },
        withEmail: true
    });
};

exports.listAllOrders = async () => {
    return adminRepository.findAllOrders();
};

// --- Dispatch dashboard (Phase 6) ---
//
// One combined read for the admin dispatch board: every in-flight
// delivery (with a computed delay flag - see admin.repository's
// findActiveDeliveries), every online agent (idle or busy), and a
// summary count block so the frontend doesn't need to derive totals
// itself. The socket layer (delivery.service.js / socket.js) pushes
// live updates into the "admins" room on top of this initial snapshot -
// see docs/API.md for the event list.
exports.getDispatchOverview = async () => {
    const [deliveries, agents] = await Promise.all([
        adminRepository.findActiveDeliveries(),
        adminRepository.findOnlineAgents()
    ]);

    const normalizedDeliveries = deliveries.map((d) => ({
        ...d,
        is_delayed: !!d.is_delayed
    }));

    const delayed = normalizedDeliveries.filter((d) => d.is_delayed);

    return {
        deliveries: normalizedDeliveries,
        agents,
        delayed,
        summary: {
            active_deliveries: normalizedDeliveries.length,
            delayed_deliveries: delayed.length,
            online_agents: agents.length,
            idle_agents: agents.filter((a) => Number(a.active_delivery_count) === 0).length
        }
    };
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

exports.getAnalytics = async () => {
    const DAYS = 14;
    const FORECAST_DAYS = 7;
    const REGRESSION_WINDOW_DAYS = 30;

    const [dailyRows, regressionRows, topProducts, topSellers] = await Promise.all([
        adminRepository.getDailySales(DAYS),
        adminRepository.getDailySales(REGRESSION_WINDOW_DAYS),
        adminRepository.getTopProducts(5),
        adminRepository.getTopSellers(5)
    ]);

    // Fill in days with zero sales so the chart doesn't have gaps or
    // misleadingly compress into however many days actually had orders.
    const byDay = new Map(dailyRows.map((r) => [
        new Date(r.day).toISOString().slice(0, 10),
        { revenue: Number(r.revenue) || 0, order_count: Number(r.order_count) || 0 }
    ]));

    const dailySales = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        const entry = byDay.get(key) || { revenue: 0, order_count: 0 };
        dailySales.push({
            day: key,
            label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            ...entry
        });
    }

    const forecast = forecastRevenue(regressionRows, REGRESSION_WINDOW_DAYS, FORECAST_DAYS);

    return {
        dailySales,
        forecast,
        topProducts: topProducts.map((p) => ({
            ...p,
            units_sold: Number(p.units_sold) || 0,
            revenue: Number(p.revenue) || 0
        })),
        topSellers: topSellers.map((s) => ({
            ...s,
            revenue: Number(s.revenue) || 0,
            order_count: Number(s.order_count) || 0
        }))
    };
};

// Ordinary least-squares linear regression on daily revenue over the
// trailing window, projected forward. Deliberately not anything fancier
// (no seasonality modeling, no external forecasting service) - a straight
// trend line over 30 days is honest about being a rough estimate, which
// is the right amount of confidence to project for a platform this size,
// versus a "smarter" model that would just be overfitting noise.
function forecastRevenue(rows, windowDays, forecastDays) {
    const byDay = new Map(rows.map((r) => [
        new Date(r.day).toISOString().slice(0, 10),
        Number(r.revenue) || 0
    ]));

    // x = day index (0..windowDays-1), y = revenue that day
    const points = [];
    for (let i = windowDays - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        points.push({ x: windowDays - 1 - i, y: byDay.get(key) || 0 });
    }

    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

    const denominator = n * sumXX - sumX * sumX;
    // Flat history (or all-zero) - denominator is 0, fall back to a flat
    // projection at the historical average rather than dividing by zero.
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const projected = [];
    for (let i = 0; i < forecastDays; i++) {
        const x = n + i;
        const date = new Date();
        date.setDate(date.getDate() + i + 1);
        projected.push({
            day: date.toISOString().slice(0, 10),
            label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            revenue: Math.max(0, Math.round(intercept + slope * x))
        });
    }

    return projected;
}

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

// Old seller document-verification review methods lived here
// (listPendingVerifications / getSellerVerificationDetail /
// approveSellerVerification / rejectSellerVerification) - removed; see
// accountVerification module for the centralized replacement, which now
// also triggers the paid-badge resync previously done here (see
// accountVerification.service's approve()).

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
