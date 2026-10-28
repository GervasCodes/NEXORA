const db = require("../config/db");
const trialRepository = require("../modules/subscription/trial.repository");
const subscriptionRepository = require("../modules/subscription/subscription.repository");
const settingsService = require("../modules/settings/settings.service");
const entitlements = require("../modules/stock/stock.entitlements");

// Plan-driven access for Nexora Stock Management (Phase 8). Replaces the on/off
// requireSubscriptionTier gate on the stock routes.
//
// Who gets what (resolveAccess):
//   - inside the 7-day seller trial        -> mode "full", every feature on;
//   - an entitled, paid plan               -> mode "full", the features the plan's
//                                            `entitlements` JSON says (admin-editable);
//   - a plan that lapsed within the export
//     grace window (setting
//     stock_export_grace_days)             -> mode "read_only": viewing and exporting
//                                            still work, anything that writes is refused;
//   - otherwise                            -> mode "none".
//
// The answer is cached per seller for CACHE_TTL_MS, because the stock screens fire
// many requests at once and each used to cost three database reads. A plan change
// can therefore take up to that long to show; invalidate(sellerId) clears it early.

const CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX = 5000;
const cache = new Map();

const lastLapsedPlan = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sp.code AS plan_code, sp.entitlements,
                COALESCE(ss.grace_ends_at, ss.current_period_end) AS ended_at,
                TIMESTAMPDIFF(DAY, COALESCE(ss.grace_ends_at, ss.current_period_end), NOW()) AS days_since
         FROM seller_subscriptions ss
         JOIN subscription_plans sp ON sp.id = ss.plan_id
         WHERE ss.seller_id = ? AND sp.code <> 'free' AND ss.current_period_start IS NOT NULL
         ORDER BY COALESCE(ss.grace_ends_at, ss.current_period_end) DESC LIMIT 1`,
        [sellerId]
    );
    return rows[0] || null;
};

const compute = async (sellerId) => {
    const [trial, entitled] = await Promise.all([
        trialRepository.findTrialForUser(sellerId),
        subscriptionRepository.findEntitledForSeller(sellerId)
    ]);

    if (trial && Number(trial.in_trial) === 1) {
        return { mode: "full", reason: "trial", planCode: "trial", features: entitlements.trial() };
    }

    const paid = entitled && (entitled.status === "active" || entitled.status === "past_due");
    if (paid) {
        const features = entitlements.forPlan(entitled.plan_code, entitled.entitlements);
        return {
            mode: features.stock_pos ? "full" : "none",
            reason: features.stock_pos ? "plan" : "not_in_plan",
            planCode: entitled.plan_code,
            features
        };
    }

    const lapsed = await lastLapsedPlan(sellerId);
    if (lapsed && Number(lapsed.days_since) >= 0) {
        const grace = await settingsService.getStockExportGraceDays();
        const features = entitlements.forPlan(lapsed.plan_code, lapsed.entitlements);
        if (features.stock_pos && Number(lapsed.days_since) <= grace) {
            return {
                mode: "read_only", reason: "lapsed", planCode: lapsed.plan_code, features,
                graceEndsInDays: Math.max(0, grace - Number(lapsed.days_since))
            };
        }
    }
    return { mode: "none", reason: "no_plan", planCode: "free", features: entitlements.none() };
};

const resolveAccess = async (sellerId, { fresh = false } = {}) => {
    const hit = cache.get(sellerId);
    if (!fresh && hit && hit.expires > Date.now()) return hit.value;
    const value = await compute(sellerId);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(sellerId, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
};

const isRead = (method) => method === "GET" || method === "HEAD";

// requireFeature("stock_pos") - the gate for every stock route.
// requireFeature("stock_cost_reports") - an extra check on one route.
const requireFeature = (feature) => async (req, res, next) => {
    try {
        const access = await resolveAccess(req.user.id);
        req.stockAccess = access;

        if (access.mode === "none" || !access.features[feature]) {
            const notInPlan = access.mode !== "none" || access.reason === "not_in_plan";
            return res.status(403).json({
                success: false,
                code: access.mode === "none" && !notInPlan ? "SUBSCRIPTION_REQUIRED" : "FEATURE_NOT_IN_PLAN",
                feature,
                message: notInPlan
                    ? "Your plan doesn't include this feature. Upgrade your plan to use it."
                    : "Your free trial has ended. Choose a plan to keep using this feature.",
                current_plan_code: access.planCode
            });
        }
        if (access.mode === "read_only" && !isRead(req.method)) {
            return res.status(403).json({
                success: false,
                code: "SUBSCRIPTION_REQUIRED",
                read_only: true,
                feature,
                message: "Your plan has ended. You can still view and export your data; renew your plan to make changes.",
                current_plan_code: access.planCode
            });
        }
        return next();
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = requireFeature;
module.exports.requireFeature = requireFeature;
module.exports.resolveAccess = resolveAccess;
module.exports.invalidate = (sellerId) => { cache.delete(sellerId); };
module.exports.clearCache = () => cache.clear();
module.exports.CACHE_TTL_MS = CACHE_TTL_MS;
