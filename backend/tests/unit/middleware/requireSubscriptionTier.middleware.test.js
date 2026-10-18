jest.mock("../../../src/modules/subscription/subscription.repository");
jest.mock("../../../src/modules/subscription/trial.repository");

const subscriptionRepository = require("../../../src/modules/subscription/subscription.repository");
const trialRepository = require("../../../src/modules/subscription/trial.repository");
const requireSubscriptionTier = require("../../../src/middleware/requireSubscriptionTier.middleware");

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const TRIAL_RUNNING = { in_trial: 1, days_left: 5, trial_started_at: "2026-10-12", trial_ends_at: "2026-10-19" };
const TRIAL_OVER = { in_trial: 0, days_left: 0, trial_started_at: "2026-10-01", trial_ends_at: "2026-10-08" };

const run = async ({ trial, plan }) => {
    trialRepository.findTrialForUser.mockResolvedValue(trial);
    subscriptionRepository.findEntitledForSeller.mockResolvedValue(plan);
    const req = { user: { id: 1 } };
    const res = mockRes();
    const next = jest.fn();
    await requireSubscriptionTier(req, res, next);
    return { req, res, next };
};

describe("requireSubscriptionTier.middleware", () => {
    it("unlocks everything during the free trial, even with no plan at all", async () => {
        const { next, res, req } = await run({ trial: TRIAL_RUNNING, plan: null });

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(req.sellerAccess).toMatchObject({ inTrial: true, daysLeft: 5, paymentMode: false });
    });

    it("calls next() after the trial when the seller has an active, non-free plan", async () => {
        const { next, res } = await run({ trial: TRIAL_OVER, plan: { plan_code: "growth", status: "active" } });

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("asks for payment once the trial is over and the seller has no subscription row", async () => {
        const { next, res } = await run({ trial: TRIAL_OVER, plan: null });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                code: "SUBSCRIPTION_REQUIRED",
                trial_ended: true,
                current_plan_code: "free"
            })
        );
    });

    it("asks for payment after the trial when the current plan is explicitly the free plan", async () => {
        const { next, res } = await run({ trial: TRIAL_OVER, plan: { plan_code: "free", status: "active" } });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "SUBSCRIPTION_REQUIRED", current_plan_code: "free" })
        );
    });

    it("asks for payment after the trial when a paid-tier row isn't active (e.g. cancelled/expired)", async () => {
        const { next, res } = await run({ trial: TRIAL_OVER, plan: { plan_code: "pro", status: "cancelled" } });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "SUBSCRIPTION_REQUIRED", current_plan_code: "pro" })
        );
    });

    it("answers 400 when the access lookup itself fails", async () => {
        trialRepository.findTrialForUser.mockRejectedValue(new Error("db down"));
        subscriptionRepository.findEntitledForSeller.mockResolvedValue(null);
        const res = mockRes();
        const next = jest.fn();

        await requireSubscriptionTier({ user: { id: 1 } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
