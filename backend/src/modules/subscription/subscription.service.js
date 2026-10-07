const db = require("../../config/db");
const subscriptionRepository = require("./subscription.repository");
const settingsService = require("../settings/settings.service");
const sponsorshipCreditService = require("../sponsorshipCredit/sponsorshipCredit.service");
const notificationService = require("../notification/notification.service");
const logger = require("../../utils/logger").child({ module: "subscription" });

// Days a seller keeps plan benefits after a renewing period ends
// without renewal. Benefits lapse at grace_ends_at, not at period end.
const GRACE_DAYS = 3;
// How far ahead the "your plan expires" reminder goes out.
const REMINDER_DAYS = 3;

// Activating a subscription row starts a billing period, and every
// billing period comes with its own sponsorship-credit allotment - so the
// two always happen together, in the caller's transaction. This is the
// single "activation/renewal" hook: a renewal or plan change is a fresh
// seller_subscriptions row (see migration 073), so it reaches here as a
// new subscription id and gets a fresh grant; the old period's unused
// credits are not carried over. Re-activating the same subscription id
// (a replayed webhook) is harmless - the grant is idempotent per id.
// Returns false (and grants nothing) when the subscription was already
// active, so a replayed payment webhook does not reset the period.
const activateAndGrantCredits = async (subscription, plan, connection) => {
    const transitioned = await subscriptionRepository.activateSubscription(
        subscription.id, subscription.seller_id, plan.billing_cycle, connection
    );
    if (!transitioned) return false;

    const activated = await subscriptionRepository.findById(subscription.id, connection);
    await sponsorshipCreditService.grantForSubscription({ subscription: activated, plan }, connection);
    return true;
};

// ---- Public / seller-facing ---------------------------------------------

exports.listPlans = async () => {
    const plans = await subscriptionRepository.listActivePlans();
    return plans.map(formatPlan);
};

exports.getMySubscription = async (sellerId) => {
    const current = await subscriptionRepository.findEntitledForSeller(sellerId);
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
            sponsorshipCreditsPerMonth: Number(current.sponsorship_credits_per_month) || 0,
            features: current.features ? (typeof current.features === "string" ? JSON.parse(current.features) : current.features) : []
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

    const current = await subscriptionRepository.findEntitledForSeller(sellerId);
    if (current && (current.status === "active" || current.status === "past_due") && current.commission_rate_override !== null) {
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
    const current = await subscriptionRepository.findEntitledForSeller(sellerId);
    let maxActiveListings = null;

    if (current) {
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
        await activateAndGrantCredits(subscription, plan, connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.cancelMySubscription = async (sellerId) => {
    const current = await subscriptionRepository.findEntitledForSeller(sellerId);
    if (!current || current.status !== "active") {
        throw new Error("You have no active paid subscription to cancel");
    }
    await subscriptionRepository.cancelSubscription(current.id);
    // auto_renew = FALSE, but the seller keeps plan benefits until
    // current_period_end. subscriptionLifecycle.job.js moves the row to
    // "expired" once that passes (no grace window when auto-renew is off).
    return { message: "Renewal turned off. Your plan benefits remain active until the end of the current billing period." };
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
        await activateAndGrantCredits({ id: subscriptionId, seller_id: sellerId }, plan, connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return exports.getMySubscription(sellerId);
};

// ---- Lifecycle (called daily from jobs/subscriptionLifecycle.job.js) -----

// Each transition is its own conditional UPDATE, so a re-run or a second
// worker can never double-apply it. Benefits do not depend on these
// transitions: findEntitledForSeller decides against NOW().
exports.runLifecycleSweep = async () => {
    const ended = await subscriptionRepository.findPeriodEnded();
    let movedToPastDue = 0;
    let movedToExpired = 0;

    for (const row of ended) {
        if (row.auto_renew) {
            if (await subscriptionRepository.markPastDue(row.id, GRACE_DAYS)) movedToPastDue++;
        } else if (await subscriptionRepository.markExpired(row.id)) {
            movedToExpired++;
        }
    }

    const graceEnded = await subscriptionRepository.findGraceEnded();
    for (const row of graceEnded) {
        if (await subscriptionRepository.markExpired(row.id)) movedToExpired++;
    }

    return { movedToPastDue, movedToExpired };
};

exports.sendExpiryReminders = async () => {
    const expiring = await subscriptionRepository.findExpiringSoon(REMINDER_DAYS);
    let sent = 0;

    for (const row of expiring) {
        if (!(await subscriptionRepository.claimExpiryReminder(row.id))) continue;

        const date = new Date(row.current_period_end).toISOString().slice(0, 10);
        // Auto-renew plans get a renewal prompt: the seller pays from their
        // dashboard, and a missed payment moves the plan into the grace window.
        const renews = Boolean(row.auto_renew);
        notificationService.notify({
            userId: row.seller_id,
            type: renews ? "subscription_renewal_due" : "subscription_expiring",
            titleKey: renews ? "notifications.subscription.renewal.title" : "notifications.subscription.expiring.title",
            messageKey: renews ? "notifications.subscription.renewal.message" : "notifications.subscription.expiring.message",
            messageParams: { planName: row.plan_name, date },
            withEmail: true
        }).catch((err) => logger.warn({ err, subscriptionId: row.id }, "subscription expiry notify error"));
        sent++;
    }

    return sent;
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
    sponsorshipCreditsPerMonth: Number(plan.sponsorship_credits_per_month) || 0,
    features: plan.features ? (typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features) : [],
    isActive: Boolean(plan.is_active),
    sortOrder: plan.sort_order
});
