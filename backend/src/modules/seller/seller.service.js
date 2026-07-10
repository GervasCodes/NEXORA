const sellerRepository = require("./seller.repository");
const settingsService = require("../settings/settings.service");

const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

exports.uploadStoreLogo = async (userId, file) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found");
    }

    const result = await uploadToCloudinary(file.buffer, "seller/logos");

    await sellerRepository.updateLogo(userId, result.secure_url);

    return result.secure_url;
};

// Create Seller Profile
exports.createSellerProfile = async (userId, data) => {

    const existingSeller = await sellerRepository.findByUserId(userId);

    if (existingSeller) {
        throw new Error("Seller profile already exists.");
    }

    const storeSlug = data.store_name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");

    const sellerId = await sellerRepository.create({
        user_id: userId,
        store_name: data.store_name,
        store_slug: storeSlug,
        store_description: data.store_description,
        store_type_id: data.store_type_id
    });

    return {
        sellerId,
        storeSlug
    };
};

// Get Seller Profile
exports.getSellerProfile = async (userId) => {

    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found.");
    }

    return seller;
};

// Update Seller Profile
exports.updateSellerProfile = async (userId, data) => {

    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found.");
    }

    await sellerRepository.update(userId, data);

    return await sellerRepository.findByUserId(userId);
};

exports.uploadStoreBanner = async (userId, file) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found");
    }

    const result = await uploadToCloudinary(file.buffer, "seller/banners");

    await sellerRepository.updateBanner(userId, result.secure_url);

    return result.secure_url;
};
// --- Delivery agent roster ---

exports.getRoster = async (sellerId) => {
    return sellerRepository.findRoster(sellerId);
};

exports.addAgentToRoster = async (sellerId, email) => {
    const user = await sellerRepository.findAgentByEmail(email);

    if (!user) {
        throw new Error("No NEXORA user found with that email");
    }

    if (user.role !== "delivery_agent") {
        throw new Error("That email isn't registered as a delivery agent account");
    }

    const alreadyAdded = await sellerRepository.isInRoster(sellerId, user.id);

    if (alreadyAdded) {
        throw new Error("That agent is already in your roster");
    }

    await sellerRepository.addToRoster(sellerId, user.id);

    return {
        agent_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email
    };
};

exports.removeAgentFromRoster = async (sellerId, agentId) => {
    const affectedRows = await sellerRepository.removeFromRoster(sellerId, agentId);

    if (!affectedRows) {
        throw new Error("That agent isn't in your roster");
    }
};

// --- Analytics ---

exports.getAnalytics = async (sellerId) => {
    const [totals, statusBreakdown, dailySales, topProducts, repeatCustomers, commissionRate] = await Promise.all([
        sellerRepository.getOrderTotals(sellerId),
        sellerRepository.getOrderStatusBreakdown(sellerId),
        sellerRepository.getDailySales(sellerId, 30),
        sellerRepository.getTopProducts(sellerId, 5),
        sellerRepository.getRepeatCustomerCount(sellerId),
        settingsService.getCommissionRate()
    ]);

    return {
        commissionRate,
        totals: {
            totalOrders: Number(totals.total_orders),
            grossSales: Number(totals.gross_sales),
            commissionPaid: Number(totals.commission_paid),
            netEarnings: Number(totals.net_earnings)
        },
        statusBreakdown: statusBreakdown.reduce((acc, row) => {
            acc[row.status] = Number(row.count);
            return acc;
        }, {}),
        dailySales: dailySales.map((row) => ({ day: row.day, amount: Number(row.amount) })),
        topProducts: topProducts.map((row) => ({
            ...row,
            units_sold: Number(row.units_sold),
            revenue: Number(row.revenue)
        })),
        repeatCustomers: Number(repeatCustomers)
    };
};
