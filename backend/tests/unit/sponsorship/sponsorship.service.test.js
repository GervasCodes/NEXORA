jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/sponsorship/sponsorship.repository");
jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");

const db = require("../../../src/config/db");
const sponsorshipRepository = require("../../../src/modules/sponsorship/sponsorship.repository");
const productRepository = require("../../../src/modules/product/product.repository");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const notificationService = require("../../../src/modules/notification/notification.service");

const sponsorshipService = require("../../../src/modules/sponsorship/sponsorship.service");

const connection = db.__mockConnection;

beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue(undefined);
});

describe("sponsorship.service.getPricing", () => {
    it("returns the current daily rate plus the fixed duration bounds", async () => {
        settingsService.getSponsorshipDailyRate.mockResolvedValue(5000);

        const pricing = await sponsorshipService.getPricing();

        expect(pricing).toEqual({ daily_rate: 5000, min_days: 1, max_days: 30 });
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
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "100000.00" });
        sponsorshipRepository.create.mockRejectedValue(new Error("db write failed"));

        await expect(sponsorshipService.createCampaign(10, 1, 5)).rejects.toThrow("db write failed");
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
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
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue({
            id: 1, seller_id: 10, product_id: 5, status: "active"
        });
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);

        const result = await sponsorshipService.cancelCampaign(10, 1);

        expect(sponsorshipRepository.updateStatus).toHaveBeenCalledWith(1, "cancelled", connection);
        expect(productRepository.setSponsored).toHaveBeenCalledWith(5, false, connection);
        expect(result).toEqual({ status: "cancelled" });
    });

    it("leaves is_sponsored on when a second active campaign still covers the product", async () => {
        sponsorshipRepository.findByIdForUpdate.mockResolvedValue({
            id: 1, seller_id: 10, product_id: 5, status: "active"
        });
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(true);

        await sponsorshipService.cancelCampaign(10, 1);

        expect(productRepository.setSponsored).not.toHaveBeenCalled();
    });
});

describe("sponsorship.service.expireDueCampaigns", () => {
    it("does nothing and commits when nothing is due", async () => {
        sponsorshipRepository.findExpiredActive.mockResolvedValue([]);

        const count = await sponsorshipService.expireDueCampaigns();

        expect(count).toBe(0);
        expect(connection.commit).toHaveBeenCalled();
        expect(sponsorshipRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("expires every due campaign, clears is_sponsored where nothing else covers it, and notifies each seller", async () => {
        sponsorshipRepository.findExpiredActive.mockResolvedValue([
            { id: 1, seller_id: 10, product_id: 5, product_name: "Shoe" },
            { id: 2, seller_id: 20, product_id: 6, product_name: "Bag" }
        ]);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);

        const count = await sponsorshipService.expireDueCampaigns();

        expect(count).toBe(2);
        expect(sponsorshipRepository.updateStatus).toHaveBeenCalledWith(1, "expired", connection);
        expect(sponsorshipRepository.updateStatus).toHaveBeenCalledWith(2, "expired", connection);
        expect(productRepository.setSponsored).toHaveBeenCalledWith(5, false, connection);
        expect(productRepository.setSponsored).toHaveBeenCalledWith(6, false, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(notificationService.notify).toHaveBeenCalledTimes(2);
    });

    it("never lets a notification failure surface as a job failure (fire-and-forget, after commit)", async () => {
        sponsorshipRepository.findExpiredActive.mockResolvedValue([
            { id: 1, seller_id: 10, product_id: 5, product_name: "Shoe" }
        ]);
        sponsorshipRepository.hasOtherActiveCampaign.mockResolvedValue(false);
        notificationService.notify.mockRejectedValue(new Error("notification service down"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await expect(sponsorshipService.expireDueCampaigns()).resolves.toBe(1);

        consoleSpy.mockRestore();
    });
});
