jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/subscription/subscription.repository");
jest.mock("../../../src/modules/settings/settings.service");

const db = require("../../../src/config/db");
const subscriptionRepository = require("../../../src/modules/subscription/subscription.repository");
const settingsService = require("../../../src/modules/settings/settings.service");

const subscriptionService = require("../../../src/modules/subscription/subscription.service");

const connection = db.__mockConnection;

describe("subscription.service.getMySubscription", () => {
    it("returns the free-plan shape when the seller has no subscription row at all", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue(null);
        subscriptionRepository.countActiveListingsForSeller.mockResolvedValue(3);

        const result = await subscriptionService.getMySubscription(10);

        expect(result).toEqual({
            plan: { code: "free", name: "Free" },
            status: "active",
            listingCount: 3,
            isFreePlan: true
        });
    });

    it("formats an active paid subscription, parsing JSON features and numeric fields", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            id: 5,
            plan_code: "pro",
            plan_name: "Pro",
            price: "15000.00",
            billing_cycle: "monthly",
            commission_rate_override: "5.00",
            max_active_listings: 200,
            features: JSON.stringify(["priority_support", "featured_badge"]),
            status: "active",
            current_period_start: "2026-08-01",
            current_period_end: "2026-09-01",
            auto_renew: 1
        });
        subscriptionRepository.countActiveListingsForSeller.mockResolvedValue(42);

        const result = await subscriptionService.getMySubscription(10);

        expect(result).toMatchObject({
            subscriptionId: 5,
            plan: {
                code: "pro",
                name: "Pro",
                price: 15000,
                commissionRateOverride: 5,
                maxActiveListings: 200,
                features: ["priority_support", "featured_badge"]
            },
            autoRenew: true,
            listingCount: 42,
            isFreePlan: false
        });
    });
});

describe("subscription.service.getEffectiveCommissionRate", () => {
    it("falls back to the platform default when the seller has no active override", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue(null);
        settingsService.isCommissionMonetizationEnabled.mockResolvedValue(true);
        settingsService.getCommissionRate.mockResolvedValue(10);

        const rate = await subscriptionService.getEffectiveCommissionRate(10);

        expect(rate).toBe(10);
    });

    it("falls back to the platform default when the current subscription isn't active", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "cancelled",
            commission_rate_override: "5.00"
        });
        settingsService.isCommissionMonetizationEnabled.mockResolvedValue(true);
        settingsService.getCommissionRate.mockResolvedValue(10);

        const rate = await subscriptionService.getEffectiveCommissionRate(10);

        expect(rate).toBe(10);
    });

    it("falls back to the platform default when the plan has no override set (NULL)", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "active",
            commission_rate_override: null
        });
        settingsService.isCommissionMonetizationEnabled.mockResolvedValue(true);
        settingsService.getCommissionRate.mockResolvedValue(10);

        const rate = await subscriptionService.getEffectiveCommissionRate(10);

        expect(rate).toBe(10);
    });

    it("uses the plan's commission override when the subscription is active and has one", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "active",
            commission_rate_override: "5.00"
        });
        settingsService.isCommissionMonetizationEnabled.mockResolvedValue(true);

        const rate = await subscriptionService.getEffectiveCommissionRate(10);

        expect(rate).toBe(5);
        expect(settingsService.getCommissionRate).not.toHaveBeenCalled();
    });

    // Monetization Master Switch (Phase 1): commission is flat 0% when
    // commission monetization is off, ignoring plan overrides and the
    // platform default alike - not even consulted, let alone applied.
    it("returns flat 0% and ignores plan overrides when commission monetization is disabled", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "active",
            commission_rate_override: "5.00"
        });
        settingsService.isCommissionMonetizationEnabled.mockResolvedValue(false);

        const rate = await subscriptionService.getEffectiveCommissionRate(10);

        expect(rate).toBe(0);
        expect(settingsService.getCommissionRate).not.toHaveBeenCalled();
        expect(subscriptionRepository.findCurrentForSeller).not.toHaveBeenCalled();
    });
});

describe("subscription.service.canCreateListing", () => {
    it("allows unlimited listings when the plan's max is NULL", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "active",
            max_active_listings: null
        });

        const result = await subscriptionService.canCreateListing(10);

        expect(result).toEqual({ allowed: true });
        expect(subscriptionRepository.countActiveListingsForSeller).not.toHaveBeenCalled();
    });

    it("falls back to the free plan's limit when the seller has no active subscription", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue(null);
        subscriptionRepository.findPlanByCode.mockResolvedValue({ max_active_listings: 20 });
        subscriptionRepository.countActiveListingsForSeller.mockResolvedValue(20);

        const result = await subscriptionService.canCreateListing(10);

        expect(subscriptionRepository.findPlanByCode).toHaveBeenCalledWith("free");
        expect(result.allowed).toBe(false);
        expect(result.message).toMatch(/up to 20 active listings/);
    });

    it("allows a new listing when the seller is under their plan's limit", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "active",
            max_active_listings: 200
        });
        subscriptionRepository.countActiveListingsForSeller.mockResolvedValue(50);

        const result = await subscriptionService.canCreateListing(10);

        expect(result).toEqual({ allowed: true });
    });

    it("blocks a new listing once the seller is at their plan's limit", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({
            status: "active",
            max_active_listings: 50
        });
        subscriptionRepository.countActiveListingsForSeller.mockResolvedValue(50);

        const result = await subscriptionService.canCreateListing(10);

        expect(result.allowed).toBe(false);
    });
});

describe("subscription.service.activateSubscription", () => {
    it("throws when the subscription doesn't exist", async () => {
        subscriptionRepository.findById.mockResolvedValue(null);

        await expect(subscriptionService.activateSubscription(999)).rejects.toThrow("Subscription not found");
    });

    it("activates within a transaction and commits", async () => {
        subscriptionRepository.findById.mockResolvedValue({ id: 5, seller_id: 10, plan_id: 2 });
        subscriptionRepository.findPlanById.mockResolvedValue({ id: 2, billing_cycle: "monthly" });

        await subscriptionService.activateSubscription(5);

        expect(subscriptionRepository.activateSubscription).toHaveBeenCalledWith(5, 10, "monthly", connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("rolls back and rethrows when activation fails mid-transaction", async () => {
        subscriptionRepository.findById.mockResolvedValue({ id: 5, seller_id: 10, plan_id: 2 });
        subscriptionRepository.findPlanById.mockResolvedValue({ id: 2, billing_cycle: "monthly" });
        subscriptionRepository.activateSubscription.mockRejectedValue(new Error("db write failed"));

        await expect(subscriptionService.activateSubscription(5)).rejects.toThrow("db write failed");
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});

describe("subscription.service.cancelMySubscription", () => {
    it("throws when the seller has no active paid subscription", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue(null);

        await expect(subscriptionService.cancelMySubscription(10)).rejects.toThrow(
            "You have no active paid subscription to cancel"
        );
    });

    it("throws when the current subscription isn't active", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({ id: 5, status: "cancelled" });

        await expect(subscriptionService.cancelMySubscription(10)).rejects.toThrow(
            "You have no active paid subscription to cancel"
        );
    });

    it("turns off auto-renew but keeps plan benefits until period end", async () => {
        subscriptionRepository.findCurrentForSeller.mockResolvedValue({ id: 5, status: "active" });

        const result = await subscriptionService.cancelMySubscription(10);

        expect(subscriptionRepository.cancelSubscription).toHaveBeenCalledWith(5);
        expect(result.message).toMatch(/remain active until the end of the current billing period/);
    });
});
