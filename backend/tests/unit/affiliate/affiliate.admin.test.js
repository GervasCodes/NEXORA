jest.mock("../../../src/modules/affiliate/affiliate.repository");
jest.mock("../../../src/modules/buyerWallet/buyerWallet.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/utils/logger", () => ({
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));

const affiliateRepository = require("../../../src/modules/affiliate/affiliate.repository");
const buyerWalletRepository = require("../../../src/modules/buyerWallet/buyerWallet.repository");
const affiliateService = require("../../../src/modules/affiliate/affiliate.service");

beforeEach(() => jest.clearAllMocks());

describe("affiliate approval (item 7)", () => {
    it("approves a pending account once", async () => {
        affiliateRepository.setStatusIf.mockResolvedValueOnce(true);
        affiliateRepository.findByUserId.mockResolvedValueOnce({ user_id: 5, status: "active" });

        const result = await affiliateService.approve(5);

        expect(affiliateRepository.setStatusIf).toHaveBeenCalledWith(5, "pending", "active");
        expect(result.changed).toBe(true);
        expect(result.account.status).toBe("active");
    });

    it("is idempotent: approving an already active account changes nothing", async () => {
        affiliateRepository.setStatusIf.mockResolvedValueOnce(false);
        affiliateRepository.findByUserId.mockResolvedValueOnce({ user_id: 5, status: "active" });

        const result = await affiliateService.approve(5);

        expect(result.changed).toBe(false);
    });

    it("refuses to approve a rejected (suspended) account", async () => {
        affiliateRepository.setStatusIf.mockResolvedValueOnce(false);
        affiliateRepository.findByUserId.mockResolvedValueOnce({ user_id: 5, status: "suspended" });

        await expect(affiliateService.approve(5)).rejects.toThrow(/not pending/);
    });

    it("reject moves a pending account to suspended", async () => {
        affiliateRepository.setStatusIf.mockResolvedValueOnce(true);
        affiliateRepository.findByUserId.mockResolvedValueOnce({ user_id: 5, status: "suspended" });

        const result = await affiliateService.reject(5);

        expect(affiliateRepository.setStatusIf).toHaveBeenCalledWith(5, "pending", "suspended");
        expect(result.changed).toBe(true);
    });
});

describe("minimum payout (item 8)", () => {
    it("rejects a payout under the minimum", () => {
        expect(() => affiliateService.assertPayoutAllowed({ balance: 50000, amount: 9999 }))
            .toThrow(/minimum affiliate payout/);
    });

    it("rejects a payout larger than the balance", () => {
        expect(() => affiliateService.assertPayoutAllowed({ balance: 15000, amount: 20000 }))
            .toThrow(/Insufficient affiliate balance/);
    });

    it("allows a payout at the minimum that the balance covers", () => {
        expect(() => affiliateService.assertPayoutAllowed({ balance: 10000, amount: affiliateService.MIN_PAYOUT_TZS }))
            .not.toThrow();
    });
});

describe("commission clawback on reversal (item 11)", () => {
    const paidConversion = { id: 3, affiliate_user_id: 7, order_id: 42, commission_amount: "2500.00", status: "paid" };

    it("debits the affiliate wallet once when a paid commission is reversed", async () => {
        const executor = {};
        affiliateRepository.findConversionForUpdate.mockResolvedValueOnce(paidConversion);
        buyerWalletRepository.incrementBalance.mockResolvedValueOnce(-2500);

        const changed = await affiliateService.reverseConversionOn(3, executor);

        expect(changed).toBe(true);
        expect(buyerWalletRepository.incrementBalance).toHaveBeenCalledWith(7, -2500, executor);
        expect(affiliateRepository.setConversionStatus).toHaveBeenCalledWith(3, "reversed", executor);
    });

    it("does nothing on a second reversal (no double clawback)", async () => {
        affiliateRepository.findConversionForUpdate.mockResolvedValueOnce({ ...paidConversion, status: "reversed" });

        const changed = await affiliateService.reverseConversionOn(3, {});

        expect(changed).toBe(false);
        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("reverses a pending commission without touching the wallet", async () => {
        affiliateRepository.findConversionForUpdate.mockResolvedValueOnce({ ...paidConversion, status: "pending" });

        await affiliateService.reverseConversionOn(3, {});

        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(affiliateRepository.setConversionStatus).toHaveBeenCalledWith(3, "reversed", {});
    });
});
