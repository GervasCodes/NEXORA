const sellerRepository = require("./seller.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const authRepository = require("../auth/auth.repository");

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

// --- Verification fee / paid "Verified Seller" badge ---
// The document-based per-seller verification_status flow this used to
// depend on was removed in migration 029 - approval now comes from the
// centralized users.account_verification_status gate (set at
// registration, reviewed via accountVerification module) instead.

// Reconciles the paid badge: only true once the account-level
// verification has been approved AND the fee has been paid, in either
// order.
const syncBadge = async (userId) => {
    const [seller, user] = await Promise.all([
        sellerRepository.findByUserId(userId),
        authRepository.findById(userId)
    ]);
    const shouldBeVerified = user?.account_verification_status === "approved" && !!seller.verification_fee_paid;

    if (!!seller.is_verified !== shouldBeVerified) {
        await sellerRepository.setBadge(userId, shouldBeVerified);

        if (shouldBeVerified) {
            notificationService.notify({
                userId,
                type: "seller_verification",
                titleKey: "notifications.seller.badge.title",
                messageKey: "notifications.seller.badge.message",
                withEmail: true
            }).catch((err) => console.error("badge notify error:", err));
        }
    }

    return shouldBeVerified;
};

// Kicks off the fee payment. Does NOT mark the fee paid - it only sends
// the mobile money prompt to the seller's phone and returns "pending".
// The fee is marked paid, and the badge synced, only once
// confirmVerificationFeePaid() is called below - which happens from
// payment.service's webhook handler after MalipoPay/Selcom confirm the
// seller actually completed the payment on their end.
exports.payVerificationFee = async (userId, phone) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found. Set up your store first.");
    }

    if (seller.verification_fee_paid) {
        throw new Error("The verification fee has already been paid.");
    }

    if (!phone) {
        throw new Error("A mobile money phone number is required.");
    }

    const feeAmount = await settingsService.getVerificationFee();

    // Lazy require to avoid a circular dependency: payment.service also
    // requires seller.service to call confirmVerificationFeePaid below.
    const paymentService = require("../payment/payment.service");
    return paymentService.initiateVerificationFeePayment(userId, phone, feeAmount);
};

// Called by payment.service once the mobile money provider's webhook
// confirms the verification fee payment actually completed.
exports.confirmVerificationFeePaid = async (userId, amount, transactionReference) => {
    await sellerRepository.setVerificationFeePaid(userId, amount, transactionReference);
    await syncBadge(userId);
};

exports.syncBadgeForSeller = syncBadge;
