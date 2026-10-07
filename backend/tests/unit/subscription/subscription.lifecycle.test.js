jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/subscription/subscription.repository");
jest.mock("../../../src/modules/sponsorshipCredit/sponsorshipCredit.service");
jest.mock("../../../src/modules/notification/notification.service");

const subscriptionRepository = require("../../../src/modules/subscription/subscription.repository");
const subscriptionService = require("../../../src/modules/subscription/subscription.service");

describe("subscription.service.runLifecycleSweep", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        subscriptionRepository.findGraceEnded.mockResolvedValue([]);
    });

    it("moves an auto-renew period that ended into past_due with a grace window", async () => {
        subscriptionRepository.findPeriodEnded.mockResolvedValue([{ id: 7, auto_renew: 1 }]);
        subscriptionRepository.markPastDue.mockResolvedValue(true);

        const result = await subscriptionService.runLifecycleSweep();

        expect(subscriptionRepository.markPastDue).toHaveBeenCalledWith(7, 3);
        expect(subscriptionRepository.markExpired).not.toHaveBeenCalled();
        expect(result).toEqual({ movedToPastDue: 1, movedToExpired: 0 });
    });

    it("expires a cancelled plan straight away at period end, with no grace window", async () => {
        subscriptionRepository.findPeriodEnded.mockResolvedValue([{ id: 8, auto_renew: 0 }]);
        subscriptionRepository.markExpired.mockResolvedValue(true);

        const result = await subscriptionService.runLifecycleSweep();

        expect(subscriptionRepository.markExpired).toHaveBeenCalledWith(8);
        expect(subscriptionRepository.markPastDue).not.toHaveBeenCalled();
        expect(result.movedToExpired).toBe(1);
    });

    it("expires past_due rows whose grace window has ended", async () => {
        subscriptionRepository.findPeriodEnded.mockResolvedValue([]);
        subscriptionRepository.findGraceEnded.mockResolvedValue([{ id: 9 }]);
        subscriptionRepository.markExpired.mockResolvedValue(true);

        const result = await subscriptionService.runLifecycleSweep();

        expect(subscriptionRepository.markExpired).toHaveBeenCalledWith(9);
        expect(result.movedToExpired).toBe(1);
    });

    it("counts nothing when another run already made the transition", async () => {
        subscriptionRepository.findPeriodEnded.mockResolvedValue([{ id: 10, auto_renew: 0 }]);
        subscriptionRepository.markExpired.mockResolvedValue(false);

        const result = await subscriptionService.runLifecycleSweep();

        expect(result.movedToExpired).toBe(0);
    });
});

describe("subscription.service activation", () => {
    it("does not reset the period or grant credits when the subscription is already active", async () => {
        const db = require("../../../src/config/db");
        const creditService = require("../../../src/modules/sponsorshipCredit/sponsorshipCredit.service");
        subscriptionRepository.findById.mockResolvedValue({ id: 5, seller_id: 10, plan_id: 2 });
        subscriptionRepository.findPlanById.mockResolvedValue({ id: 2, billing_cycle: "monthly" });
        subscriptionRepository.activateSubscription.mockResolvedValue(false);

        await subscriptionService.activateSubscription(5);

        expect(creditService.grantForSubscription).not.toHaveBeenCalled();
        expect(db.__mockConnection.commit).toHaveBeenCalled();
    });
});
