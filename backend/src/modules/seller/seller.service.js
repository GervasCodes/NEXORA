const sellerRepository = require("./seller.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const authRepository = require("../auth/auth.repository");
const productRepository = require("../product/product.repository");

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

// --- Seller collections (Phase 7C) ---

exports.getCollections = async (sellerId) => {
    return sellerRepository.findCollections(sellerId);
};

exports.createCollection = async (sellerId, name) => {
    const id = await sellerRepository.createCollection(sellerId, name);
    return { id, name };
};

exports.deleteCollection = async (sellerId, collectionId) => {
    const affectedRows = await sellerRepository.deleteCollection(sellerId, collectionId);

    if (!affectedRows) {
        throw new Error("Collection not found");
    }
};

exports.getCollectionProducts = async (sellerId, collectionId) => {
    const collection = await sellerRepository.findCollectionById(sellerId, collectionId);

    if (!collection) {
        throw new Error("Collection not found");
    }

    return sellerRepository.findProductsInCollection(collectionId);
};

exports.addProductToCollection = async (sellerId, collectionId, productId) => {
    const collection = await sellerRepository.findCollectionById(sellerId, collectionId);

    if (!collection) {
        throw new Error("Collection not found");
    }

    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found in your catalog");
    }

    const alreadyIn = await sellerRepository.isProductInCollection(collectionId, productId);

    if (alreadyIn) {
        throw new Error("That product is already in this collection");
    }

    await sellerRepository.addProductToCollection(collectionId, productId);
};

exports.removeProductFromCollection = async (sellerId, collectionId, productId) => {
    const collection = await sellerRepository.findCollectionById(sellerId, collectionId);

    if (!collection) {
        throw new Error("Collection not found");
    }

    const affectedRows = await sellerRepository.removeProductFromCollection(collectionId, productId);

    if (!affectedRows) {
        throw new Error("That product isn't in this collection");
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

// Phase A5 (Advanced Analytics) - period comparison + top customers for
// this seller's product sales. Gated behind the same requireVerificationFeePaid
// middleware as GET /seller/analytics (see seller.routes.js).
function growthPercent(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

exports.getAdvancedAnalytics = async (sellerId) => {
    const [periods, topCustomers] = await Promise.all([
        sellerRepository.getPeriodComparison(sellerId),
        sellerRepository.getTopCustomers(sellerId, 5)
    ]);

    return {
        periodComparison: {
            week: {
                current: periods.thisWeek,
                previous: periods.lastWeek,
                growthPercent: growthPercent(periods.thisWeek.gmv, periods.lastWeek.gmv)
            },
            month: {
                current: periods.thisMonth,
                previous: periods.lastMonth,
                growthPercent: growthPercent(periods.thisMonth.gmv, periods.lastMonth.gmv)
            }
        },
        topCustomers: topCustomers.map((c) => ({
            ...c,
            total_spend: Number(c.total_spend) || 0,
            transaction_count: Number(c.transaction_count) || 0
        }))
    };
};

// CSV export - "products" downloads this seller's top products (from
// the existing getTopProducts query), "customers" downloads their top
// customers. Defaults to products.
exports.exportAnalyticsCsv = async (sellerId, type) => {
    if (type === "customers") {
        const rows = await sellerRepository.getTopCustomers(sellerId, 500);
        const header = "customer_id,name,total_spend,transaction_count";
        const lines = [header, ...rows.map((r) => [
            r.id,
            `"${String(r.name).replace(/"/g, '""')}"`,
            (Number(r.total_spend) || 0).toFixed(2),
            Number(r.transaction_count) || 0
        ].join(","))];
        return lines.join("\n");
    }

    const rows = await sellerRepository.getTopProducts(sellerId, 500);
    const header = "product_id,name,units_sold,revenue";
    const lines = [header, ...rows.map((r) => [
        r.id,
        `"${String(r.name).replace(/"/g, '""')}"`,
        Number(r.units_sold) || 0,
        (Number(r.revenue) || 0).toFixed(2)
    ].join(","))];
    return lines.join("\n");
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

// Kicks off the fee payment - or, while monetization_verification_fee_enabled
// is off (Monetization Master Switch), skips payment entirely and marks
// the fee waived immediately, syncing the badge right away instead of
// waiting on a webhook. amount is recorded as 0 with a "waived_free_launch"
// reference so it's visibly distinct from a real payment in the ledger/history.
exports.payVerificationFee = async (userId, phone) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found. Set up your store first.");
    }

    if (seller.verification_fee_paid) {
        throw new Error("The verification fee has already been paid.");
    }

    const verificationFeeEnabled = await settingsService.isVerificationFeeMonetizationEnabled();
    if (!verificationFeeEnabled) {
        await exports.confirmVerificationFeePaid(userId, 0, "waived_free_launch");
        return { status: "waived", message: "Verification is free during launch - your badge is now active." };
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

// Nexora Services Phase 1 - Merchant Type System. A seller opts into
// Services (or both) here; existing 'product' sellers are completely
// unaffected until they call this themselves (CHANGES.md's Registration
// Flow Step 3/4, applied post-registration rather than only at signup so
// existing sellers can opt in later too). No approval/verification gate
// on the switch itself - requireServiceProvider.middleware.js is what
// actually unlocks the Services endpoints, and that already requires an
// approved seller account underneath it.
const MERCHANT_TYPES = ["product", "service", "hybrid"];

exports.setMerchantType = async (userId, merchantType) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found. Set up your store first.");
    }

    if (!MERCHANT_TYPES.includes(merchantType)) {
        throw new Error("Invalid merchant type.");
    }

    await sellerRepository.setMerchantType(userId, merchantType);

    return { merchantType };
};
