jest.mock("../../../src/config/db", () => {
    const connection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
    };
    return { getConnection: jest.fn(async () => connection), __connection: connection };
});
jest.mock("../../../src/modules/affiliate/affiliate.repository");
jest.mock("../../../src/modules/buyerWallet/buyerWallet.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/utils/logger", () => ({
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));

const affiliateRepository = require("../../../src/modules/affiliate/affiliate.repository");
const buyerWalletRepository = require("../../../src/modules/buyerWallet/buyerWallet.repository");
const affiliateService = require("../../../src/modules/affiliate/affiliate.service");

const connection = require("../../../src/config/db").__connection;
const request = { amount: 20000, method: "mobile_money", destination: "0712345678" };

beforeEach(() => {
    jest.clearAllMocks();
    buyerWalletRepository.getWalletForUpdate.mockResolvedValue({ balance: 50000 });
    affiliateRepository.findByUserId.mockResolvedValue({ user_id: 7, status: "active" });
    affiliateRepository.hasOpenPayout.mockResolvedValue(false);
    affiliateRepository.insertPayout.mockResolvedValue(88);
    buyerWalletRepository.incrementBalance.mockResolvedValue(30000);
});

describe("requestPayout (item 8)", () => {
    it("debits the wallet and records a requested payout in one transaction", async () => {
        const result = await affiliateService.requestPayout(7, request);

        expect(buyerWalletRepository.getWalletForUpdate).toHaveBeenCalledWith(7, connection);
        expect(affiliateRepository.insertPayout).toHaveBeenCalledWith(
            { userId: 7, amount: 20000, method: "mobile_money", destination: "0712345678" }, connection
        );
        expect(buyerWalletRepository.incrementBalance).toHaveBeenCalledWith(7, -20000, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(result).toEqual({ payoutId: 88, status: "requested", balance: 30000 });
    });

    it("refuses an amount below the minimum without touching the wallet", async () => {
        await expect(affiliateService.requestPayout(7, { ...request, amount: 9000 }))
            .rejects.toThrow(/minimum affiliate payout/);

        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
    });

    it("refuses more than the wallet holds", async () => {
        buyerWalletRepository.getWalletForUpdate.mockResolvedValueOnce({ balance: 15000 });

        await expect(affiliateService.requestPayout(7, request))
            .rejects.toThrow(/Insufficient affiliate balance/);
        expect(affiliateRepository.insertPayout).not.toHaveBeenCalled();
    });

    it("allows only one open payout per affiliate", async () => {
        affiliateRepository.hasOpenPayout.mockResolvedValueOnce(true);

        await expect(affiliateService.requestPayout(7, request))
            .rejects.toThrow(/already have a payout awaiting approval/);
    });

    it("refuses a pending or suspended affiliate", async () => {
        affiliateRepository.findByUserId.mockResolvedValueOnce({ user_id: 7, status: "pending" });

        await expect(affiliateService.requestPayout(7, request))
            .rejects.toThrow(/Only an active affiliate/);
    });

    it("rejects a non-whole amount", async () => {
        await expect(affiliateService.requestPayout(7, { ...request, amount: 20000.5 }))
            .rejects.toThrow(/whole number/);
    });
});

describe("markPayoutPaid and rejectPayout", () => {
    it("marks a requested payout paid with its transfer reference", async () => {
        affiliateRepository.findPayoutForUpdate.mockResolvedValueOnce({ id: 88, status: "requested" });

        const result = await affiliateService.markPayoutPaid(88, { reference: "MPESA-REF-1" });

        expect(affiliateRepository.setPayoutStatusIf).toHaveBeenCalledWith(
            88, "requested", "paid", { reference: "MPESA-REF-1" }, connection
        );
        expect(result.changed).toBe(true);
    });

    it("is idempotent: marking an already paid payout changes nothing", async () => {
        affiliateRepository.findPayoutForUpdate.mockResolvedValueOnce({ id: 88, status: "paid" });

        const result = await affiliateService.markPayoutPaid(88, { reference: "MPESA-REF-1" });

        expect(result.changed).toBe(false);
        expect(affiliateRepository.setPayoutStatusIf).not.toHaveBeenCalled();
    });

    it("requires a transfer reference before marking paid", async () => {
        await expect(affiliateService.markPayoutPaid(88, { reference: " " }))
            .rejects.toThrow(/transfer reference/);
    });

    it("rejecting a requested payout returns the amount to the wallet", async () => {
        affiliateRepository.findPayoutForUpdate.mockResolvedValueOnce({
            id: 88, affiliate_user_id: 7, amount: "20000.00", status: "requested"
        });

        const result = await affiliateService.rejectPayout(88, { note: "Bank details unreadable" });

        expect(buyerWalletRepository.incrementBalance).toHaveBeenCalledWith(7, 20000, connection);
        expect(affiliateRepository.setPayoutStatusIf).toHaveBeenCalledWith(
            88, "requested", "rejected", { note: "Bank details unreadable" }, connection
        );
        expect(result.changed).toBe(true);
    });

    it("cannot reject a payout already paid out (no refund of money that left)", async () => {
        affiliateRepository.findPayoutForUpdate.mockResolvedValueOnce({
            id: 88, affiliate_user_id: 7, amount: "20000.00", status: "paid"
        });

        await expect(affiliateService.rejectPayout(88, {})).rejects.toThrow(/already paid/);
        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("rejecting twice returns the wallet only once", async () => {
        affiliateRepository.findPayoutForUpdate.mockResolvedValueOnce({
            id: 88, affiliate_user_id: 7, amount: "20000.00", status: "rejected"
        });

        const result = await affiliateService.rejectPayout(88, {});

        expect(result.changed).toBe(false);
        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
    });
});
