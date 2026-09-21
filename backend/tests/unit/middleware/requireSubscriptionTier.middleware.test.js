jest.mock("../../../src/modules/subscription/subscription.repository");

const subscriptionRepository = require("../../../src/modules/subscription/subscription.repository");
const requireSubscriptionTier = require("../../../src/middleware/requireSubscriptionTier.middleware");

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("requireSubscriptionTier.middleware", () => {
    it("calls next() when the seller has an active, non-free plan", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            plan_code: "growth",
            status: "active"
        });
        const req = { user: { id: 1 } };
        const res = mockRes();
        const next = jest.fn();

        await requireSubscriptionTier(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects with SUBSCRIPTION_REQUIRED when the seller has no subscription row at all (implicit free plan)", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue(null);
        const req = { user: { id: 1 } };
        const res = mockRes();
        const next = jest.fn();

        await requireSubscriptionTier(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, code: "SUBSCRIPTION_REQUIRED", current_plan_code: "free" })
        );
    });

    it("rejects when the seller's current plan is explicitly the free plan", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            plan_code: "free",
            status: "active"
        });
        const req = { user: { id: 1 } };
        const res = mockRes();
        const next = jest.fn();

        await requireSubscriptionTier(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "SUBSCRIPTION_REQUIRED", current_plan_code: "free" })
        );
    });

    it("rejects when the seller has a paid-tier plan row that isn't active (e.g. cancelled/expired)", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            plan_code: "pro",
            status: "cancelled"
        });
        const req = { user: { id: 1 } };
        const res = mockRes();
        const next = jest.fn();

        await requireSubscriptionTier(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "SUBSCRIPTION_REQUIRED", current_plan_code: "pro" })
        );
    });

    it("responds 400 if the repository lookup throws", async () => {
        subscriptionRepository.findCurrentForSeller.mockRejectedValue(new Error("db down"));
        const req = { user: { id: 1 } };
        const res = mockRes();
        const next = jest.fn();

        await requireSubscriptionTier(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "db down" }));
    });
});
