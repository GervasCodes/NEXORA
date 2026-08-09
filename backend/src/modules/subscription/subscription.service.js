const db = require("../../config/db");
const subscriptionRepository = require("./subscription.repository");
const settingsService = require("../settings/settings.service");

// ---- Public / seller-facing ---------------------------------------------

exports.listPlans = async () => {
    const plans = await subscriptionRepository.listActivePlans();
    return plans.map(formatPlan);
};

exports.getMySubscription = async (sellerId) => {
    const current = await subscriptionRepository.findCurrentForSeller(sellerId);
    const listingCount = await subscriptionRepository.countActiveListingsForSeller(sellerId);

    if (!current) {
        return {
            plan: { code: "free", name: "Free" },
            status: "active",
            listingCount,
            isFreePlan: true
        };
    }

    return {
        subscriptionId: current.id,
        plan: {
            code: current.plan_code,
            name: current.plan_name,
            price: Number(current.price),
            billingCycle: current.billing_cycle,
            commissionRateOverride: current.commission_rate_override !== null ? Number(current.commission_rate_override) : null,
            maxActiveListings: current.max_active_listings,
            features: current.features ? JSON.parse(current.features) : []
        },
        status: current.status,
        currentPeriodStart: current.current_period_start,
        currentPeriodEnd: current.current_period_end,
        autoRenew: Boolean(current.auto_renew),
        listingCount,
        isFreePlan: current.plan_code === "free"
    };
};

// Called by wallet.service.js whenever it needs the commission rate to
// apply for a specific seller - falls back to the platform default the
// same way every other rate lookup in this codebase does when nothing
// more specific is set.
//
// Monetization Master Switch: when monetization_commission_enabled is
// off, commission is flat 0% for everyone, full stop - plan overrides
// and the platform default commission_rate setting are both ignored
// rather than consulted, matching a genuinely free launch rather than
// "free unless a plan says otherwise".
exports.getEffectiveCommissionRate = async (sellerId) => {
    const commissionEnabled = await settingsService.isCommissionMonetizationEnabled();
    if (!commissionEnabled) {
        return 0;
    }

    const current = await subscriptionRepository.findCurrentForSeller(sellerId);
    if (current && current.status === "active" && current.commission_rate_override !== null) {
        return Number(current.commission_rate_override);
    }
    return settingsService.getCommissionRate();
};

// Called by product.service.js / service.service.js before activating a
// new listing. Free plan (or no subscription at all) defaults to the
// Free plan's own max_active_listings (seeded as 20) rather than an
// unlimited free tier, so the limit is always enforced from the same
// source - the subscription_plans row - not a separate hardcoded number.
exports.canCreateListing = async (sellerId) => {
    const current = await subscriptionRepository.findCurrentForSeller(sellerId);
    let maxActiveListings = null;

    if (current && current.status === "active") {
        maxActiveListings = current.max_active_listings;
    } else {
        const freePlan = await subscriptionRepository.findPlanByCode("free");
        maxActiveListings = freePlan ? freePlan.max_active_listings : null;
    }

    if (maxActiveListings === null) {
        return { allowed: true };
    }

    const count = await subscriptionRepository.countActiveListingsForSeller(sellerId);
    if (count >= maxActiveListings) {
        return {
            allowed: false,
            message: `Your current plan allows up to ${maxActiveListings} active listings. Upgrade your subscription to add more.`
        };
    }
    return { allowed: true };
};

// Called from payment.service.js once a subscription payment webhook
// confirms success - kept here (not in payment.service.js) so the
// activation/supersede logic lives with the rest of the subscription
// domain, mirroring how walletService owns wallet-crediting even though
// payment.service.js is what calls into it.
exports.activateSubscription = async (subscriptionId) => {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    const plan = await subscriptionRepository.findPlanById(subscription.plan_id);

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await subscriptionRepository.activateSubscription(subscriptionId, subscription.seller_id, plan.billing_cycle, connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.cancelMySubscription = async (sellerId) => {
    const current = await subscriptionRepository.findCurrentForSeller(sellerId);
    if (!current || current.status !== "active") {
        throw new Error("You have no active paid subscription to cancel");
    }
    await subscriptionRepository.cancelSubscription(current.id);
    // auto_renew = FALSE, but the seller keeps plan benefits until
    // current_period_end - status stays "active" until it actually
    // lapses (a future renewal job, out of scope here, would flip it to
    // "expired" once current_period_end passes with auto_renew off).
    return { message: "Auto-renew turned off. Your plan benefits remain active until the end of the current billing period." };
};

// ---- Monetization Master Switch: free-launch activation -------------------

// Called by subscription.controller.js's subscribe* actions instead of
// initiating a payment when monetization_subscriptions_enabled is off -
// creates the subscription row and activates it immediately, same
// transaction shape payment.service.js's webhook handler uses via
// activateSubscription() above, just without any payment in between.
// Works for paid plans too (not just the free plan): "sellers can select
// plans normally... subscription activates automatically" per the
// monetization roadmap - a seller isn't limited to the free plan just
// because billing hasn't started yet.
exports.subscribeFree = async (sellerId, planCode) => {
    const plan = await subscriptionRepository.findPlanByCode(planCode);
    if (!plan || !plan.is_active) {
        throw new Error("Plan not found");
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const subscriptionId = await subscriptionRepository.createSubscription(sellerId, plan.id, connection);
        await subscriptionRepository.activateSubscription(subscriptionId, sellerId, plan.billing_cycle, connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return exports.getMySubscription(sellerId);
};

// ---- Admin ----------------------------------------------------------------

exports.listAllPlansForAdmin = async () => {
    const plans = await subscriptionRepository.listAllPlans();
    return plans.map(formatPlan);
};

exports.createPlan = async (data) => {
    return subscriptionRepository.createPlan(data);
};

exports.updatePlan = async (planId, data) => {
    const plan = await subscriptionRepository.findPlanById(planId);
    if (!plan) throw new Error("Plan not found");
    await subscriptionRepository.updatePlan(planId, data);
};

exports.listAllSubscriptions = async () => {
    return subscriptionRepository.listAllSubscriptions();
};

const formatPlan = (plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price: Number(plan.price),
    billingCycle: plan.billing_cycle,
    commissionRateOverride: plan.commission_rate_override !== null ? Number(plan.commission_rate_override) : null,
    maxActiveListings: plan.max_active_listings,
    features: plan.features ? (typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features) : [],
    isActive: Boolean(plan.is_active),
    sortOrder: plan.sort_order
});
