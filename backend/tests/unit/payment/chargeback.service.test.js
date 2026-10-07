jest.mock("../../../src/config/db", () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock("../../../src/modules/payment/payment.repository");
jest.mock("../../../src/modules/payment/chargeback.repository");
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/wallet/wallet.service");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/fraud/fraud.repository");
jest.mock("../../../src/modules/audit/audit.service", () => ({ log: jest.fn() }));
jest.mock("../../../src/modules/payment/paymentReview.service", () => ({
    REASONS: { CHARGEBACK: "chargeback", CHARGEBACK_SHORTFALL: "chargeback_shortfall" },
    flag: jest.fn().mockResolvedValue({ flagged: true, isNew: true })
}));

const db = require("../../../src/config/db");
const paymentRepository = require("../../../src/modules/payment/payment.repository");
const chargebackRepository = require("../../../src/modules/payment/chargeback.repository");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const walletService = require("../../../src/modules/wallet/wallet.service");
const fraudRepository = require("../../../src/modules/fraud/fraud.repository");
const paymentReviewService = require("../../../src/modules/payment/paymentReview.service");
const chargebackService = require("../../../src/modules/payment/chargeback.service");

const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };

beforeEach(() => {
    jest.clearAllMocks();
    db.getConnection.mockResolvedValue(connection);
    paymentRepository.markChargeback.mockResolvedValue(true);
    fraudRepository.hasOpenFlag.mockResolvedValue(false);
    paymentReviewService.flag.mockResolvedValue({ flagged: true, isNew: true });
    walletRepository.incrementHeldBalance.mockResolvedValue(0);
    walletRepository.incrementBalance.mockResolvedValue(0);
});

const orderPayment = { id: 1, status: "completed", purpose: "order_payment", order_id: 10, amount: 10000 };

describe("chargeback.service.processChargeback", () => {
    it("is a no-op for a payment already marked chargeback (repeated event)", async () => {
        expect(await chargebackService.processChargeback({ ...orderPayment, status: "chargeback" }, "x")).toEqual({ alreadyProcessed: true });
        expect(paymentRepository.markChargeback).not.toHaveBeenCalled();
    });

    it("only reviews (no reversal) a dispute on a payment that is not completed here", async () => {
        const result = await chargebackService.processChargeback({ ...orderPayment, status: "failed" }, "x");

        expect(result).toEqual({ needsReview: true });
        expect(paymentRepository.markChargeback).not.toHaveBeenCalled();
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "chargeback" }));
    });

    it("does nothing else when the conditional chargeback update lost the race", async () => {
        paymentRepository.markChargeback.mockResolvedValue(false);

        expect(await chargebackService.processChargeback(orderPayment, "x")).toEqual({ alreadyProcessed: true });
        expect(chargebackRepository.findReversibleOrderItems).not.toHaveBeenCalled();
    });

    it("reverses HELD earnings, closes the items for escrow release, flags the buyer's order and queues a review", async () => {
        chargebackRepository.findReversibleOrderItems.mockResolvedValue([
            { id: 1, seller_id: 5, seller_net_amount: "9000", wallet_released: 0 }
        ]);
        walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: "9000", balance: "0" });

        const result = await chargebackService.processChargeback(orderPayment, "fraudulent");

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(5, -9000, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(chargebackRepository.markItemsReversed).toHaveBeenCalledWith([1], connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(fraudRepository.createFlag).toHaveBeenCalledWith(expect.objectContaining({ entityType: "order", entityId: 10, ruleCode: "chargeback" }));
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "chargeback" }));
        expect(result).toMatchObject({ chargeback: true, reversedTotal: 9000, shortfalls: [] });
    });

    it("takes already-released earnings from the available balance, never below zero, and reports the shortfall", async () => {
        chargebackRepository.findReversibleOrderItems.mockResolvedValue([
            { id: 2, seller_id: 6, seller_net_amount: "9000", wallet_released: 1 }
        ]);
        walletRepository.getWalletForUpdate.mockResolvedValue({ held_balance: "0", balance: "3000" });

        const result = await chargebackService.processChargeback(orderPayment, "x");

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(6, -3000, connection);
        expect(result.shortfalls).toEqual([{ sellerId: 6, shortfall: 6000 }]);
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "chargeback_shortfall" }));
    });

    it("rolls the whole reversal back and still queues the chargeback when the reversal throws", async () => {
        chargebackRepository.findReversibleOrderItems.mockResolvedValue([{ id: 3, seller_id: 5, seller_net_amount: "100", wallet_released: 0 }]);
        walletRepository.getWalletForUpdate.mockRejectedValue(new Error("lock timeout"));

        await chargebackService.processChargeback(orderPayment, "x");

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({
            reason: "chargeback",
            details: expect.objectContaining({ reversalError: "lock timeout" })
        }));
    });

    it("reverses a booking's provider earnings through the wallet service", async () => {
        chargebackRepository.sumBookingProviderNet.mockResolvedValue({ providerId: 4, net: 7000 });

        await chargebackService.processChargeback({ id: 9, status: "completed", purpose: "booking_payment", booking_id: 15 }, "x");

        expect(walletService.reverseProviderEarningsForBooking).toHaveBeenCalledWith(4, 7000, 15);
    });
});
