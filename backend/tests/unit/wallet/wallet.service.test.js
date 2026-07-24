jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/dispute/dispute.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/fraud/fraud.service");

const db = require("../../../src/config/db");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const disputeRepository = require("../../../src/modules/dispute/dispute.repository");
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

    it("splits a multi-vendor order into one credit per seller, net of commission - held (escrow) for a platform-captured payment method", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            { id: 1, seller_id: 10, subtotal: "1000.00" },
            { id: 2, seller_id: 10, subtotal: "500.00" },
            { id: 3, seller_id: 20, subtotal: "2000.00" }
        ]);
        orderRepository.findOrderById.mockResolvedValue({ id: 42, payment_method: "mobile_money" });
        settingsService.getCommissionRate.mockResolvedValue(10); // 10%
        walletRepository.incrementHeldBalance.mockResolvedValue(1350); // arbitrary return value for the assertions below

        await walletService.creditSellersForOrder(42);

        // seller 10: subtotal 1500, 10% commission = 150, net = 1350
        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(1, 10, 100, 900, false, connection);
        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(2, 10, 50, 450, false, connection);
        // seller 20: subtotal 2000, 10% commission = 200, net = 1800
        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(3, 10, 200, 1800, false, connection);

        // Escrowed method: money goes into held_balance, not the withdrawable balance.
        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, 1350, connection);
        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(20, 1800, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).toHaveBeenCalledTimes(2);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, description: expect.stringContaining("held pending release") }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("credits Cash on Delivery earnings straight to the available balance, released immediately (no platform-held money to hold back)", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            { id: 1, seller_id: 10, subtotal: "1000.00" }
        ]);
        orderRepository.findOrderById.mockResolvedValue({ id: 43, payment_method: "cash_on_delivery" });
        settingsService.getCommissionRate.mockResolvedValue(10);
        walletRepository.incrementBalance.mockResolvedValue(900);

        await walletService.creditSellersForOrder(43);

        expect(walletRepository.markItemCredited).toHaveBeenCalledWith(1, 10, 100, 900, true, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 900, connection);
        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, description: expect.not.stringContaining("held pending release") }),
            connection
        );
    });

    it("rolls back and rethrows if a repository call fails mid-transaction", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([{ id: 1, seller_id: 10, subtotal: "1000.00" }]);
        orderRepository.findOrderById.mockResolvedValue({ id: 42, payment_method: "mobile_money" });
        settingsService.getCommissionRate.mockResolvedValue(10);
        walletRepository.markItemCredited.mockRejectedValue(new Error("db write failed"));

        await expect(walletService.creditSellersForOrder(42)).rejects.toThrow("db write failed");
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});

describe("wallet.service.getWalletSummary", () => {
    it("surfaces held balance alongside available balance", async () => {
        walletRepository.getWallet.mockResolvedValue({ balance: "5000.00", held_balance: "1200.00" });
        walletRepository.findTransactions.mockResolvedValue([]);

        const result = await walletService.getWalletSummary(10);

        expect(result).toEqual({ balance: 5000, heldBalance: 1200, transactions: [] });
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

// ---- Phase 9D - Seller Release --------------------------------------------

describe("wallet.service.releaseEligibleEarnings", () => {
    it("does nothing when there are no releasable items", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(summary).toEqual({ released: 0, closedByDispute: 0, frozen: 0, amountReleased: 0 });
        expect(disputeRepository.findByOrderId).not.toHaveBeenCalled();
    });

    it("releases an item with no dispute: moves held -> available and marks it released", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(900);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, -900, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 900, connection);
        expect(walletRepository.markItemReleased).toHaveBeenCalledWith(1, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, referenceType: "escrow_release", referenceId: 42 }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(summary).toEqual({ released: 1, closedByDispute: 0, frozen: 0, amountReleased: 900 });
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 10, type: "wallet_release" })
        );
    });

    it("freezes an item with an open dispute against it and doesn't move any money", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: 1, status: "open", resolution: null }
        ]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.markItemReleased).not.toHaveBeenCalled();
        expect(summary).toEqual({ released: 0, closedByDispute: 0, frozen: 1, amountReleased: 0 });
    });

    it("freezes an item covered by a whole-order dispute (order_item_id is null)", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: null, status: "under_review", resolution: null }
        ]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.markItemReleased).not.toHaveBeenCalled();
        expect(summary.frozen).toBe(1);
    });

    it("closes out (no money moved) an item whose dispute already resolved with a refund", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: 1, status: "resolved", resolution: "refund_partial" }
        ]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).not.toHaveBeenCalled();
        expect(walletRepository.markItemReleased).toHaveBeenCalledWith(1, connection);
        expect(summary).toEqual({ released: 0, closedByDispute: 1, frozen: 0, amountReleased: 0 });
    });

    it("releases normally when the only dispute on the order resolved without a refund", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: 1, status: "rejected", resolution: "no_action" }
        ]);
        walletRepository.incrementBalance.mockResolvedValue(900);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, -900, connection);
        expect(summary.released).toBe(1);
    });

    it("only fetches each order's disputes once even with multiple items on the same order", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "500.00" },
            { id: 2, order_id: 42, seller_id: 10, seller_net_amount: "300.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(500);

        await walletService.releaseEligibleEarnings();

        expect(disputeRepository.findByOrderId).toHaveBeenCalledTimes(1);
    });
});

describe("wallet.service.releaseOrderEarnings", () => {
    it("throws when the order has nothing left to release", async () => {
        walletRepository.findReleasableItemsForOrder.mockResolvedValue([]);

        await expect(walletService.releaseOrderEarnings(42)).rejects.toThrow(
            "No held earnings are eligible for release"
        );
    });

    it("bypasses the delivered/hold-days timing gate but still freezes on an open dispute", async () => {
        walletRepository.findReleasableItemsForOrder.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: null, status: "open", resolution: null }
        ]);

        const summary = await walletService.releaseOrderEarnings(42);

        expect(walletRepository.markItemReleased).not.toHaveBeenCalled();
        expect(summary).toEqual({ released: 0, closedByDispute: 0, frozen: 1, amountReleased: 0 });
    });

    it("releases eligible items for the order when nothing blocks them", async () => {
        walletRepository.findReleasableItemsForOrder.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(900);

        const summary = await walletService.releaseOrderEarnings(42);

        expect(summary.released).toBe(1);
    });
});
