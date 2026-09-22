jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/departmentSponsorship/departmentSponsorship.repository");
jest.mock("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");
jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/modules/category/category.repository");
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");

const db = require("../../../src/config/db");
const campaignRepository = require("../../../src/modules/departmentSponsorship/departmentSponsorship.repository");
const creditRepository = require("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");
const productRepository = require("../../../src/modules/product/product.repository");
const categoryRepository = require("../../../src/modules/category/category.repository");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const notificationService = require("../../../src/modules/notification/notification.service");

const campaignService = require("../../../src/modules/departmentSponsorship/departmentSponsorship.service");

const connection = db.__mockConnection;

// The real sponsorshipCredit.service runs here (only its repository is
// mocked), so these exercise the actual included-first-then-paid split.
const givenCreditPeriod = ({ id = 3, granted, used = 0 }) => {
    creditRepository.findCurrentPeriodId.mockResolvedValue(id);
    creditRepository.findByIdForUpdate.mockResolvedValue({ id, credits_granted: granted, credits_used: used });
};

beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue(undefined);
    categoryRepository.findById.mockResolvedValue({ id: 2, name: "Fashion", is_active: true });
    productRepository.findActiveCategoriesBySeller.mockResolvedValue([{ id: 2 }]);
    campaignRepository.hasActiveForSellerCategory.mockResolvedValue(false);
    campaignRepository.create.mockResolvedValue(90);
    settingsService.getDepartmentSponsorshipDailyRate.mockResolvedValue(8000);
    settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(true);
    walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "200000.00" });
    walletRepository.incrementBalance.mockResolvedValue(160000);
    creditRepository.findCurrentPeriodId.mockResolvedValue(null);
    creditRepository.findById.mockResolvedValue(undefined);
    creditRepository.findByIdForUpdate.mockResolvedValue(undefined);
    creditRepository.incrementUsed.mockResolvedValue(true);
});

describe("departmentSponsorship.service.getPricing", () => {
    it("adds the seller's remaining included credits and the paid-purchases flag to the rate", async () => {
        creditRepository.findCurrentPeriodId.mockResolvedValue(3);
        creditRepository.findById.mockResolvedValue({ id: 3, credits_granted: 10, credits_used: 6, period_end: "2026-10-01" });

        const pricing = await campaignService.getPricing(10);

        expect(pricing).toEqual({
            daily_rate: 8000,
            min_days: 1,
            max_days: 30,
            paid_enabled: true,
            included_credits: { granted: 10, used: 6, remaining: 4, period_end: "2026-10-01" }
        });
    });
});

describe("departmentSponsorship.service.createCampaign - included credits then paid", () => {
    it("spends included credits first and charges the wallet only for the days they don't cover", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });

        const result = await campaignService.createCampaign(10, 2, 5);

        // 3 credit days + 2 paid days * 8000 = 16000
        expect(campaignRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, categoryId: 2, dailyRate: 8000, days: 5, totalCost: 16000, creditsUsed: 3 }),
            connection
        );
        expect(creditRepository.incrementUsed).toHaveBeenCalledWith(3, 3, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -16000, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 16000, description: expect.stringContaining("2 paid days") }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(result).toMatchObject({ campaignId: 90, totalCost: 16000, creditsUsed: 3 });
    });

    it("falls back to the fully paid flow, unchanged, once credits are exhausted", async () => {
        givenCreditPeriod({ granted: 3, used: 3 });

        const result = await campaignService.createCampaign(10, 2, 5);

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(campaignRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ dailyRate: 8000, days: 5, totalCost: 40000, creditsUsed: 0 }),
            connection
        );
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -40000, connection);
        expect(result).toMatchObject({ totalCost: 40000, creditsUsed: 0 });
    });

    it("opens a fully credit-funded campaign with nothing charged, even when paid sponsorship is disabled", async () => {
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        givenCreditPeriod({ granted: 10, used: 0 });

        const result = await campaignService.createCampaign(10, 2, 5);

        expect(campaignRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ dailyRate: 8000, days: 5, totalCost: 0, creditsUsed: 5 }),
            connection
        );
        expect(creditRepository.incrementUsed).toHaveBeenCalledWith(3, 5, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).not.toHaveBeenCalled();
        expect(result).toMatchObject({ totalCost: 0, creditsUsed: 5 });
    });

    it("blocks the paid remainder when paid sponsorship is disabled, without consuming anything", async () => {
        settingsService.isSponsorshipMonetizationEnabled.mockResolvedValue(false);
        givenCreditPeriod({ granted: 3, used: 1 });

        await expect(campaignService.createCampaign(10, 2, 5)).rejects.toThrow(
            "you have 2 days of included credits left"
        );

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(campaignRepository.create).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("leaves the allotment untouched when the wallet can't cover the paid remainder", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "1000.00" });

        await expect(campaignService.createCampaign(10, 2, 5)).rejects.toThrow("Insufficient wallet balance");

        expect(creditRepository.incrementUsed).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("rolls back when the guarded credit increment refuses (a concurrent campaign spent them)", async () => {
        givenCreditPeriod({ granted: 3, used: 0 });
        creditRepository.incrementUsed.mockResolvedValue(false);

        await expect(campaignService.createCampaign(10, 2, 5)).rejects.toThrow(
            "Not enough included sponsorship credits remaining"
        );

        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });
});

describe("departmentSponsorship.service - the Services row is not sponsorable", () => {
    it("leaves the 'services' row out of the seller's eligible departments", async () => {
        productRepository.findActiveCategoriesBySeller.mockResolvedValue([
            { id: 2, name: "Fashion", slug: "fashion" },
            { id: 9, name: "Services", slug: "services" }
        ]);

        const categories = await campaignService.getEligibleCategories(10);

        expect(categories).toEqual([{ id: 2, name: "Fashion", slug: "fashion" }]);
    });

    it("refuses to open a campaign against it, before any wallet or credit work", async () => {
        categoryRepository.findById.mockResolvedValue({ id: 9, name: "Services", slug: "services", is_active: true });
        productRepository.findActiveCategoriesBySeller.mockResolvedValue([{ id: 9, slug: "services" }]);

        await expect(campaignService.createCampaign(10, 9, 5)).rejects.toThrow(
            "The Services department can't be sponsored"
        );

        expect(walletRepository.getWalletForUpdate).not.toHaveBeenCalled();
        expect(campaignRepository.create).not.toHaveBeenCalled();
    });
});
