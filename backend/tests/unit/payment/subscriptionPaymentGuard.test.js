const guard = require("../../../src/modules/payment/subscriptionPaymentGuard");

const makeRepo = ({ timedOut = 0, latest = undefined } = {}) => ({
    expireStalePendingForSubscription: jest.fn().mockResolvedValue(timedOut),
    findLatestBySubscriptionId: jest.fn().mockResolvedValue(latest)
});

describe("subscription payment guard", () => {
    it("blocks a new attempt while the latest payment is still pending", async () => {
        const repo = makeRepo({ latest: { id: 1, status: "pending" } });

        await expect(
            guard.assertNoLivePendingSubscriptionPayment({ paymentRepository: repo, subscriptionId: 9 })
        ).rejects.toThrow(/already awaiting confirmation/);
    });

    it("times out a stale pending attempt and lets the seller retry", async () => {
        // The repo's conditional UPDATE marks the stale row failed (returns 1),
        // so the latest row is no longer pending.
        const repo = makeRepo({ timedOut: 1, latest: { id: 1, status: "failed" } });

        await expect(
            guard.assertNoLivePendingSubscriptionPayment({ paymentRepository: repo, subscriptionId: 9 })
        ).resolves.toEqual({ timedOut: 1 });
    });

    it("uses the 30 minute timeout the reconciliation design assumes", async () => {
        const repo = makeRepo();
        await guard.assertNoLivePendingSubscriptionPayment({ paymentRepository: repo, subscriptionId: 9 });

        expect(repo.expireStalePendingForSubscription).toHaveBeenCalledWith(9, 30);
        expect(guard.PENDING_TIMEOUT_MINUTES).toBe(30);
    });

    it("allows a payment when there is no earlier attempt", async () => {
        const repo = makeRepo({ latest: undefined });

        await expect(
            guard.assertNoLivePendingSubscriptionPayment({ paymentRepository: repo, subscriptionId: 9 })
        ).resolves.toEqual({ timedOut: 0 });
    });

    it("allows a payment after an earlier attempt completed (webhook handles duplicates)", async () => {
        const repo = makeRepo({ latest: { id: 1, status: "completed" } });

        await expect(
            guard.assertNoLivePendingSubscriptionPayment({ paymentRepository: repo, subscriptionId: 9 })
        ).resolves.toEqual({ timedOut: 0 });
    });
});
