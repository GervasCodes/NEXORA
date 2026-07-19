jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/fraud/fraud.service");

const db = require("../../../src/config/db");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const notificationService = require("../../../src/modules/notification/notification.service");
const fraudService = require("../../../src/modules/fraud/fraud.service");

const walletService = require("../../../src/modules/wallet/wallet.service");

const connection = db.__mockConnection;

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
    fraudService.evaluateWithdrawal.mockResolvedValue(undefined);
});

describe("wallet.service.creditSellersForOrder", () => {
    it("is idempotent: commits and does nothing when there are no uncredited items", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([]);

        await walletService.creditSellersForOrder(1);

        expect(connection.commit).toHaveBeenCalled();
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("splits a multi-vendor order into one credit per seller, net of commission", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            { id: 1, seller_id: 10, subtotal: "1000.00" },
            { id: 2, seller_id: 10, subtotal: "500.00" },
            { id: 3, seller_id: 20, subtotal: "2000.00" }
        ]);
        settingsService.getCommissionRate.mockResolvedValue(10); // 10%
        walletRepository.incrementBalance.mockResolvedValue(1350); // arbitrary return value for the assertions below

        await walletService.creditSellersForOrder(42);

        // seller 10: subtotal 1500, 10% commission = 150, net = 1350
        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(1, 10, 100, 900, connection);
        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(2, 10, 50, 450, connection);
        // seller 20: subtotal 2000, 10% commission = 200, net = 1800
        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(3, 10, 200, 1800, connection);

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 1350, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(20, 1800, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledTimes(2);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("rolls back and rethrows if a repository call fails mid-transaction", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([{ id: 1, seller_id: 10, subtotal: "1000.00" }]);
        settingsService.getCommissionRate.mockResolvedValue(10);
        walletRepository.markItemCredited.mockRejectedValue(new Error("db write failed"));

        await expect(walletService.creditSellersForOrder(42)).rejects.toThrow("db write failed");
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});

describe("wallet.service.requestWithdrawal", () => {
    it("rejects a zero or negative amount", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });

        await expect(walletService.requestWithdrawal(10, 0, "mobile_money", {})).rejects.toThrow(
            "must be greater than zero"
        );
        expect(connection.rollback).toHaveBeenCalled();
    });

    it("rejects a withdrawal larger than the current wallet balance", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "100.00" });

        await expect(walletService.requestWithdrawal(10, 500, "mobile_money", {})).rejects.toThrow(
            "exceeds your wallet balance"
        );
    });

    it("debits the wallet, records a withdrawal + transaction, and evaluates fraud after commit", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(77);

        const result = await walletService.requestWithdrawal(10, 500, "mobile_money", { phone: "0700000000" });

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -500, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", referenceType: "withdrawal", referenceId: 77 }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(fraudService.evaluateWithdrawal).toHaveBeenCalledWith(10, 500);
        expect(result).toEqual({ withdrawalId: 77, balance: 4500 });
    });

    it("never lets a fraud-evaluation failure surface as a withdrawal failure (fire-and-forget)", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(77);
        fraudService.evaluateWithdrawal.mockRejectedValue(new Error("fraud service down"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await expect(walletService.requestWithdrawal(10, 500, "mobile_money", {})).resolves.toMatchObject({ withdrawalId: 77 });

        consoleSpy.mockRestore();
    });
});

describe("wallet.service.processWithdrawal", () => {
    it("throws when the withdrawal request doesn't exist", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue(null);

        await expect(walletService.processWithdrawal(1, "approve", null)).rejects.toThrow("Withdrawal request not found");
    });

    it("throws when the withdrawal is already in a terminal state", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "rejected", seller_id: 10, amount: "500" });

        await expect(walletService.processWithdrawal(1, "approve", null)).rejects.toThrow('is already "rejected"');
    });

    it("allows marking an already-approved withdrawal as paid", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "approved", seller_id: 10, amount: "500" });

        const result = await walletService.processWithdrawal(1, "paid", null);

        expect(result).toEqual({ status: "paid" });
        expect(walletRepository.updateWithdrawalStatus).toHaveBeenCalledWith(1, "paid", null, connection);
    });

    it("refunds the seller's wallet when rejecting a pending withdrawal", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "pending", seller_id: 10, amount: "500" });
        walletRepository.incrementBalance.mockResolvedValue(1000);

        const result = await walletService.processWithdrawal(1, "reject", "duplicate request");

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 500, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "credit", referenceType: "withdrawal" }),
            connection
        );
        expect(result).toEqual({ status: "rejected" });
    });

    it("rejects an invalid action", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "pending", seller_id: 10, amount: "500" });

        await expect(walletService.processWithdrawal(1, "bogus", null)).rejects.toThrow("Invalid action");
    });
});
