jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/sponsorship/sponsorship.repository");
jest.mock("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");
jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");

const db = require("../../../src/config/db");
const sponsorshipRepository = require("../../../src/modules/sponsorship/sponsorship.repository");
const creditRepository = require("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");
const productRepository = require("../../../src/modules/product/product.repository");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const notificationService = require("../../../src/modules/notification/notification.service");

const sponsorshipService = require("../../../src/modules/sponsorship/sponsorship.service");

const connection = db.__mockConnection;

// The real sponsorshipCredit.service runs in these tests (only its
// repository is mocked), so they exercise the actual included-first-then-
// paid split rather than a stub of it. Default: the seller has no credit
// period at all, i.e. zero included credits.
const givenCreditPeriod = ({ id = 3, granted, used = 0 }) => {
    creditRepository.findCurrentPeriodId.mockResolvedValue(id);
    creditRepository.findByIdForUpdate.mockResolvedValue({
        id, credits_granted: granted, credits_used: used
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue(undefined);
    creditRepository.findCurrentPeriodId.mockResolvedValue(null);
    creditRepository.findById.mockResolvedValue(undefined);
    creditRepository.findByIdForUpdate.mockResolvedValue(undefined);
    creditRepository.incrementUsed.mockResolvedValue(true);
});

describe("sponsorship.service.getPricing", () => {
    it("returns the daily rate, the duration bounds, and a seller with no credit period as zero included credits", async () => {
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(true);

        const pricing = await sponsorshipService.getPricing(10);

        expect(pricing).toEqual({
            daily_rate: 5000,
            min_days: 1,
            max_days: 30,
            paid_enabled: true,
            included_credits: { granted: 0, used: 0, remaining: 0, period_end: null }
        });
    });

    it("reports the seller's remaining included credits and whether paid purchases are available", async () => {
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        creditRepository.findCurrentPeriodId.mockResolvedValue(3);
        creditRepository.findById.mockResolvedValue({
            id: 3, credits_granted: 10, credits_used: 4, period_end: "2026-10-01"
        });

        const pricing = await sponsorshipService.getPricing(10);

        expect(pricing.paid_enabled).toBe(false);
        expect(pricing.included_credits).toEqual({ granted: 10, used: 4, remaining: 6, period_end: "2026-10-01" });
    });
});

describe("sponsorship.service.createCampaign", () => {
    it("rejects a duration outside 1-30 days", async () => {
        await expect(sponsorshipService.createCampaign(10, 1, 0)).rejects.toThrow(
            "Choose a duration between 1 and 30 days"
        );
        await expect(sponsorshipService.createCampaign(10, 1, 31)).rejects.toThrow(
            "Choose a duration between 1 and 30 days"
        );
    });

    it("rejects a product that doesn't belong to this seller", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 99, is_active: true, name: "Shoe" });

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow("Product not found");
    });

    it("rejects a deactivated product", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: false, name: "Shoe" });

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow(
            "Only an active, published product can be sponsored"
        );
    });

    it("rejects when the wallet balance can't cover the total cost, without touching the ledger", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(true);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "10000.00" });

        // 5 days * 5000/day = 25000, more than the 10000 balance
        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow(
            "Insufficient wallet balance"
        );

        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("debits the wallet, opens the campaign, flips is_sponsored, and commits", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(true);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "100000.00" });
        sponsorshipRepository.create.mockResolvedValue(77);
        walletRepository.incrementBalance.mockResolvedValue(75000);

        const result = await sponsorshipService.createCampaign(10, 1, 5);

        expect(sponsorshipRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, productId: 1, dailyRate: 5000, days: 5, totalCost: 25000 }),
            connection
        );
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -25000, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", referenceType: "sponsorship_campaign", referenceId: 77 }),
            connection
        );
        expect(productRepository.setSponsored).toHaveBeenCalledWith(1, true, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(result).toMatchObject({ campaignId: 77, totalCost: 25000, balance: 75000 });
    });

    it("rolls back if the campaign insert fails mid-transaction", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(true);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "100000.00" });
        sponsorshipRepository.create.mockRejectedValue(new Error("db write failed"));

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow("db write failed");
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    // Monetization Master Switch: monetization_sponsorship_enabled now only
    // controls whether the PAID remainder can be bought a la carte. Credits
    // are already paid for through the subscription, so they keep working.
    it("opens a fully credit-funded campaign with nothing charged, even when paid sponsorship is disabled", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "0.00" });
        givenCreditPeriod({ granted: 10, used: 2 });
        sponsorshipRepository.create.mockResolvedValue(78);

        const result = await sponsorshipService.createCampaign(10, 1, 5);

        expect(sponsorshipRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, productId: 1, dailyRate: 5000, days: 5, totalCost: 0, creditsUsed: 5 }),
            connection
        );
        expect(creditRepository.incrementUsed).toHaveBeenCalledWith(3, 5, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).not.toHaveBeenCalled();
        expect(productRepository.setSponsored).toHaveBeenCalledWith(1, true, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(result).toMatchObject({ campaignId: 78, totalCost: 0, creditsUsed: 5 });
    });

    it("blocks a seller with no included credits when paid sponsorship is disabled", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "999999.00" });

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow(
            "Paid sponsorship isn't available yet"
        );

        expect(sponsorshipRepository.create).not.toHaveBeenCalled();
        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("blocks the paid remainder when disabled, telling the seller how many credit days they do have", async () => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "999999.00" });
        givenCreditPeriod({ granted: 3, used: 1 });

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow(
            "you have 2 days of included credits left"
        );

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(sponsorshipRepository.create).not.toHaveBeenCalled();
    });
});

// Credit consumption order: included credits first, then the paid a la
// carte flow for whatever they don't cover.
describe("sponsorship.service.createCampaign - included credits then paid", () => {
    beforeEach(() => {
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10, is_active: true, name: "Shoe" });
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(true);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "100000.00" });
        sponsorshipRepository.create.mockResolvedValue(80);
        walletRepository.incrementBalance.mockResolvedValue(90000);
    });

    it("spends included credits first and charges the wallet only for the days they don't cover", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });

        const result = await sponsorshipService.createCampaign(10, 1, 5);

        // 3 credit days + 2 paid days * 5000 = 10000
        expect(sponsorshipRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ dailyRate: 5000, days: 5, totalCost: 10000, creditsUsed: 3 }),
            connection
        );
        expect(creditRepository.incrementUsed).toHaveBeenCalledWith(3, 3, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -10000, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 10000, description: expect.stringContaining("2 paid days") }),
            connection
        );
        expect(result).toMatchObject({ campaignId: 80, totalCost: 10000, creditsUsed: 3 });
    });

    it("never charges the wallet when credits cover the whole campaign, even with paid sponsorship enabled", async () => {
        givenCreditPeriod({ granted: 10, used: 0 });

        const result = await sponsorshipService.createCampaign(10, 1, 4);

        expect(creditRepository.incrementUsed).toHaveBeenCalledWith(3, 4, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).not.toHaveBeenCalled();
        expect(result).toMatchObject({ totalCost: 0, creditsUsed: 4 });
    });

    it("falls back to the fully paid flow, unchanged, once credits are exhausted", async () => {
        givenCreditPeriod({ granted: 3, used: 3 });

        const result = await sponsorshipService.createCampaign(10, 1, 5);

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(sponsorshipRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ dailyRate: 5000, days: 5, totalCost: 25000, creditsUsed: 0 }),
            connection
        );
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -25000, connection);
        expect(result).toMatchObject({ totalCost: 25000, creditsUsed: 0 });
    });

    it("leaves the allotment untouched when the wallet can't cover the paid remainder", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "1000.00" });

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow("Insufficient wallet balance");

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("rolls back when the guarded credit increment refuses (a concurrent campaign spent them)", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });
        creditRepository.incrementUsed.mockResolvedValue(false);

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow(
            "Not enough included sponsorship credits remaining"
        );

        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("locks the wallet before the credit period, the same order every campaign service uses", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });

        await sponsorshipService.createCampaign(10, 1, 5);

        const walletLock = walletRepository.getWalletForUpdate.mock.invocationCallOrder[0];
        const creditLock = creditRepository.findByIdForUpdate.mock.invocationCallOrder[0];
        expect(walletLock).toBeLessThan(creditLock);
    });
});

// An active campaign whose window has already run out, so a cancel has
// nothing left to refund or return: isolates the is_sponsored/status logic.
const expiredWindowCampaign = () => ({
    id: 1, seller_id: 10, product_id: 5, status: "active",
    days: 5, credits_used: 0, daily_rate: 1000, ends_at: new Date(Date.now() - 1000)
});

describe("sponsorship.service.cancelCampaign", () => {
    it("throws when the campaign doesn't exist or belongs to another seller", async () => {
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue(null);

        await expect(sponsorshipService.cancelCampaign(10, 1)).rejects.toThrow("Campaign not found");
    });

    it("throws when the campaign is no longer active", async () => {
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue({ id: 1, seller_id: 10, status: "expired" });

        await expect(sponsorshipService.cancelCampaign(10, 1)).rejects.toThrow('is already "expired"');
    });

    it("clears is_sponsored when no other active campaign covers the product", async () => {
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue(expiredWindowCampaign());
        sponsorshipRepository.markCancelled.mockResolvedValue(true);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);

        const result = await sponsorshipService.cancelCampaign(10, 1);

        expect(sponsorshipRepository.markCancelled).toHaveBeenCalledWith(
            1, { refundAmount: 0, creditDaysReturned: 0 }, connection
        );
        expect(productRepository.setSponsored).toHaveBeenCalledWith(5, false, connection);
        expect(result).toMatchObject({ status: "cancelled", refund_amount: 0, credit_days_returned: 0 });
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("refunds the unused paid days to the wallet and records the refund on the campaign", async () => {
        const endsAt = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000);
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue({
            id: 1, seller_id: 10, product_id: 5, status: "active",
            days: 5, credits_used: 0, daily_rate: 1000, ends_at: endsAt
        });
        sponsorshipRepository.markCancelled.mockResolvedValue(true);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);
        walletRepository.incrementBalance.mockResolvedValue(13000);

        const result = await sponsorshipService.cancelCampaign(10, 1);

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 3000, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                sellerId: 10, type: "credit", amount: 3000, balanceAfter: 13000,
                referenceType: "sponsorship_campaign_refund", referenceId: 1
            }),
            connection
        );
        expect(sponsorshipRepository.markCancelled).toHaveBeenCalledWith(
            1, { refundAmount: 3000, creditDaysReturned: 0 }, connection
        );
        expect(result).toMatchObject({ status: "cancelled", refund_amount: 3000, balance: 13000 });
    });

    it("rolls back when the campaign was no longer active by the time it was flipped (lost a race with expiry)", async () => {
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue(expiredWindowCampaign());
        sponsorshipRepository.markCancelled.mockResolvedValue(false);

        await expect(sponsorshipService.cancelCampaign(10, 1)).rejects.toThrow("could not be cancelled");

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("leaves is_sponsored on when a second active campaign still covers the product", async () => {
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue(expiredWindowCampaign());
        sponsorshipRepository.markCancelled.mockResolvedValue(true);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(true);

        await sponsorshipService.cancelCampaign(10, 1);

        expect(productRepository.setSponsored).not.toHaveBeenCalled();
    });
});

describe("sponsorship.service.expireDueCampaigns", () => {
    it("does nothing (and opens no transaction) when nothing is due", async () => {
        sponsorshipRepository.findExpiredActiveIds.mockResolvedValue([]);

        const count = await sponsorshipService.expireDueCampaigns();

        expect(count).toBe(0);
        expect(db.getConnection).not.toHaveBeenCalled();
        expect(sponsorshipRepository.expireIfDue).not.toHaveBeenCalled();
    });

    it("expires every due campaign, clears is_sponsored where nothing else covers it, and notifies each seller", async () => {
        sponsorshipRepository.findExpiredActiveIds.mockResolvedValue([
            { id: 1, seller_id: 10, product_id: 5, product_name: "Shoe" },
            { id: 2, seller_id: 20, product_id: 6, product_name: "Bag" }
        ]);
        sponsorshipRepository.expireIfDue.mockResolvedValue(true);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);

        const count = await sponsorshipService.expireDueCampaigns();

        expect(count).toBe(2);
        expect(sponsorshipRepository.expireIfDue).toHaveBeenCalledWith(1, connection);
        expect(sponsorshipRepository.expireIfDue).toHaveBeenCalledWith(2, connection);
        expect(productRepository.setSponsored).toHaveBeenCalledWith(5, false, connection);
        expect(productRepository.setSponsored).toHaveBeenCalledWith(6, false, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(notificationService.notify).toHaveBeenCalledTimes(2);
    });

    it("skips (rolls back, no notification) a campaign that was cancelled or already expired since the list was read", async () => {
        sponsorshipRepository.findExpiredActiveIds.mockResolvedValue([
            { id: 1, seller_id: 10, product_id: 5, product_name: "Shoe" }
        ]);
        sponsorshipRepository.expireIfDue.mockResolvedValue(false);

        const count = await sponsorshipService.expireDueCampaigns();

        expect(count).toBe(0);
        expect(connection.rollback).toHaveBeenCalled();
        expect(productRepository.setSponsored).not.toHaveBeenCalled();
        expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it("never lets a notification failure surface as a job failure (fire-and-forget, after commit)", async () => {
        sponsorshipRepository.findExpiredActiveIds.mockResolvedValue([
            { id: 1, seller_id: 10, product_id: 5, product_name: "Shoe" }
        ]);
        sponsorshipRepository.expireIfDue.mockResolvedValue(true);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);
        notificationService.notify.mockRejectedValue(new Error("notification service down"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await expect(sponsorshipService.expireDueCampaigns()).resolves.toBe(1);

        consoleSpy.mockRestore();
    });
});
