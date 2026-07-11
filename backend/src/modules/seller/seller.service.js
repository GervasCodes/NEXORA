const sellerRepository = require("./seller.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const mobileMoneyProvider = require("../payment/providers/mobileMoney.provider");

const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

const DOCUMENT_TYPES = ["national_id", "voter_id", "business_registration"];

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

// --- Seller verification (National ID / Voter ID / business registration) ---

exports.getVerification = async (userId) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found. Set up your store first.");
    }

    const documents = await sellerRepository.findDocumentsBySeller(userId);
    const feeAmount = await settingsService.getVerificationFee();

    return {
        verification_status: seller.verification_status,
        verification_rejection_reason: seller.verification_rejection_reason,
        verification_submitted_at: seller.verification_submitted_at,
        verification_reviewed_at: seller.verification_reviewed_at,
        verification_fee_paid: !!seller.verification_fee_paid,
        verification_fee_amount: seller.verification_fee_amount,
        is_verified: !!seller.is_verified,
        required_fee: feeAmount,
        documents
    };
};

// files: { national_id: [file], voter_id: [file], business_registration: [file] }
exports.submitVerification = async (userId, files) => {
    const seller = await sellerRepository.findByUserId(userId);

    if (!seller) {
        throw new Error("Seller profile not found. Set up your store first.");
    }

    if (seller.verification_status === "pending") {
        throw new Error("Your documents are already under review.");
    }

    if (seller.verification_status === "approved") {
        throw new Error("Your seller account is already verified.");
    }

    const missing = DOCUMENT_TYPES.filter((type) => !files?.[type]?.[0]);
    if (missing.length > 0) {
        throw new Error(`Please upload all required documents: ${missing.join(", ")}`);
    }

    for (const type of DOCUMENT_TYPES) {
        const file = files[type][0];
        const result = await uploadToCloudinary(file.buffer, "seller/verification", "auto");
        await sellerRepository.insertDocument(userId, type, result.secure_url);
    }

    await sellerRepository.setVerificationSubmitted(userId);

    notificationService.notify({
        userId,
        type: "seller_verification",
        title: "Verification documents submitted",
        message: "We've received your verification documents. An admin will review them shortly.",
        withEmail: true
    }).catch((err) => console.error("verification submit notify error:", err));

    return exports.getVerification(userId);
};

// Reconciles the paid badge: only true once an admin has approved AND the
// fee has been paid, in either order.
const syncBadge = async (userId) => {
    const seller = await sellerRepository.findByUserId(userId);
    const shouldBeVerified = seller.verification_status === "approved" && !!seller.verification_fee_paid;

    if (!!seller.is_verified !== shouldBeVerified) {
        await sellerRepository.setBadge(userId, shouldBeVerified);

        if (shouldBeVerified) {
            notificationService.notify({
                userId,
                type: "seller_verification",
                title: "You're now a Verified Seller!",
                message: "Your Verified Seller badge is live. Advanced analytics, revenue reports and premium tools are now unlocked.",
                withEmail: true
            }).catch((err) => console.error("badge notify error:", err));
        }
    }

    return shouldBeVerified;
};

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

    const result = await mobileMoneyProvider.initiate(phone, feeAmount, {
        purpose: "seller_verification_fee",
        sellerId: userId
    });

    if (!result.success) {
        throw new Error("Payment failed. Please try again.");
    }

    await sellerRepository.setVerificationFeePaid(userId, feeAmount, result.transactionReference);
    await syncBadge(userId);

    return exports.getVerification(userId);
};

exports.isApproved = async (userId) => {
    const seller = await sellerRepository.findByUserId(userId);
    return seller?.verification_status === "approved";
};

exports.syncBadgeForSeller = syncBadge;
