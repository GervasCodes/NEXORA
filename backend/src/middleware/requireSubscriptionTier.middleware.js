const subscriptionRepository = require("../modules/subscription/subscription.repository");

// Replaces the old requireVerificationFeePaid gate on Analytics/AI once
// the one-time verification fee was retired (see syncBadge in
// seller.service.js). Analytics and the AI seller-advisory endpoints now
// unlock with a paid subscription tier instead of a one-time fee - the
// Free plan can still sell with no restriction, it just doesn't include
// these features, matching the rest of the subscription_plans-driven
// feature model (max_active_listings, commission_rate_override, etc).
//
// Deliberately checks the seller's CURRENT plan directly rather than
// going through settingsService.isSubscriptionsMonetizationEnabled(): a
// seller who subscribed for free while that flag is off (see
// subscription.service.js#subscribeFree) still has a real, active,
// non-free plan row, and should be treated the same as a seller who
// paid for one - "is subscriptions monetization on" and "does this
// seller have a paid-tier plan" are two different questions.
module.exports = async (req, res, next) => {
    try {
        const current = await subscriptionRepository.findCurrentForSeller(req.user.id);
        const onPaidTier = !!current && current.status === "active" && current.plan_code !== "free";

        if (!onPaidTier) {
            return res.status(403).json({
                success: false,
                code: "SUBSCRIPTION_REQUIRED",
                message: "This feature is included in paid subscription plans. Upgrade your plan to unlock it.",
                current_plan_code: current ? current.plan_code : "free"
            });
        }

        next();
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
