const trialService = require("../modules/subscription/trial.service");

// Gate for the plan-only features (Analytics, AI seller insights, POS /
// business tools). Always run requireApprovedSeller (or
// requireBusinessToolsAccess) first.
//
// Access comes from one place - trialService.getAccessState():
//   - inside the 7-day seller trial: everything is unlocked, no payment;
//   - after the trial: a paid, entitled plan is required (a lapsed row
//     that still says status=active does not count - see
//     subscriptionRepository.findEntitledForSeller).
// The Free plan keeps working for basic selling either way; it just does
// not include these features once the trial is over.
module.exports = async (req, res, next) => {
    try {
        const access = await trialService.getAccessState(req.user.id);

        if (!access.hasGatedAccess) {
            return res.status(403).json({
                success: false,
                code: "SUBSCRIPTION_REQUIRED",
                message: "Your free trial has ended. Choose a plan to keep using this feature.",
                trial_ended: access.trialUsed,
                current_plan_code: access.currentPlanCode
            });
        }

        req.sellerAccess = access;
        next();
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
