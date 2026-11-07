// Repositories/providers/cross-module collaborators are mocked so these
// tests exercise payment.service's own branching logic (idempotency,
// late success, amount checks, reference matching, ...) in isolation - no
// DB, no network.
jest.mock("../../../src/modules/payment/payment.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/booking/booking.repository");
jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/payment/providers/mobileMoney.provider");
jest.mock("../../../src/modules/payment/providers/snippe.provider");
jest.mock("../../../src/modules/payment/providers/malipopayCard.provider");
jest.mock("../../../src/modules/payment/providers/paypal.provider");
jest.mock("../../../src/modules/wallet/wallet.service");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/buyerWallet/buyerWallet.repository");
jest.mock("../../../src/modules/buyerWallet/buyerWallet.service");
jest.mock("../../../src/modules/subscription/subscription.repository");
jest.mock("../../../src/modules/subscription/subscription.service");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/payment/chargeback.service");
jest.mock("../../../src/modules/payment/paymentReview.service", () => ({
    REASONS: {
        PAID_AFTER_CANCEL: "paid_after_cancel",
        DUPLICATE_PAYMENT: "duplicate_payment",
        AMOUNT_MISMATCH: "amount_mismatch",
        NOT_APPLICABLE: "not_applicable",
        APPLY_FAILED: "apply_failed",
        PROVIDER_COMPLETED_NOT_HERE: "provider_completed_not_here",
        CHARGEBACK: "chargeback",
        CHARGEBACK_SHORTFALL: "chargeback_shortfall"
    },
    flag: jest.fn().mockResolvedValue({ flagged: true, isNew: true }),
    list: jest.fn(),
    resolve: jest.fn(),
    countOpen: jest.fn()
}));
jest.mock("../../../src/socket/socket", () => ({ emitToAdmins: jest.fn(), emitToUser: jest.fn() }), { virtual: true });

const paymentRepository = require("../../../src/modules/payment/payment.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const bookingRepository = require("../../../src/modules/booking/booking.repository");
const db = require("../../../src/config/db");
const mobileMoneyProvider = require("../../../src/modules/payment/providers/mobileMoney.provider");
const snippeProvider = require("../../../src/modules/payment/providers/snippe.provider");
const paypalProvider = require("../../../src/modules/payment/providers/paypal.provider");
const walletService = require("../../../src/modules/wallet/wallet.service");
const settingsService = require("../../../src/modules/settings/settings.service");
const buyerWalletRepository = require("../../../src/modules/buyerWallet/buyerWallet.repository");
const buyerWalletService = require("../../../src/modules/buyerWallet/buyerWallet.service");
const subscriptionRepository = require("../../../src/modules/subscription/subscription.repository");
const subscriptionService = require("../../../src/modules/subscription/subscription.service");
const notificationService = require("../../../src/modules/notification/notification.service");
const chargebackService = require("../../../src/modules/payment/chargeback.service");
const paymentReviewService = require("../../../src/modules/payment/paymentReview.service");

const paymentService = require("../../../src/modules/payment/payment.service");

beforeEach(() => {
    jest.clearAllMocks();
    walletService.creditSellersForOrder.mockResolvedValue(undefined);
    walletService.creditProvidersForBooking.mockResolvedValue(undefined);
    paymentRepository.claimCompleted.mockResolvedValue(true);
    paymentRepository.markFailed.mockResolvedValue(true);
    paymentRepository.hasRecentPending.mockResolvedValue(false);
    notificationService.notify.mockResolvedValue(undefined);
    paymentReviewService.flag.mockResolvedValue({ flagged: true, isNew: true });
    buyerWalletService.creditFromTopUp.mockResolvedValue(undefined);
    subscriptionService.activateSubscription.mockResolvedValue(undefined);
    mobileMoneyProvider.checkStatus.mockReset();
    paypalProvider.getOrder.mockReset();
});

const REF = "ORDER-5-9F3A61C0D2B7";

describe("payment.service - initiateMobileMoneyPayment", () => {
    it("throws when the order doesn't belong to the requesting buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999, payment_method: "mobile_money", payment_status: "unpaid" });

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("Order not found");
    });

    it("throws when the order isn't set up for mobile money", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 1, payment_method: "snippe", payment_status: "unpaid" });

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("not set up for mobile money");
    });

    it("throws when the order is already paid", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 1, payment_method: "mobile_money", payment_status: "paid" });

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("already been paid");
    });

    it("refuses a second attempt while one was just started and is still pending", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 1, payment_method: "mobile_money", payment_status: "unpaid", shipping_phone: "0700000000", total_amount: 5000
        });
        paymentRepository.hasRecentPending.mockResolvedValue(true);

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("just started");
        expect(paymentRepository.create).not.toHaveBeenCalled();
        expect(mobileMoneyProvider.initiate).not.toHaveBeenCalled();
    });

    it("marks the payment failed and re-throws when the provider call itself errors", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 1, payment_method: "mobile_money", payment_status: "unpaid",
            shipping_phone: "0700000000", total_amount: 5000
        });
        paymentRepository.create.mockResolvedValue(42);
        mobileMoneyProvider.initiate.mockRejectedValue(new Error("network down"));

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("network down");
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(42);
    });

    it("marks failed (not thrown network error) when the provider returns success:false", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 1, payment_method: "mobile_money", payment_status: "unpaid",
            shipping_phone: "0700000000", total_amount: 5000
        });
        paymentRepository.create.mockResolvedValue(42);
        mobileMoneyProvider.initiate.mockResolvedValue({ success: false });

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("Payment could not be initiated");
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(42);
    });

    it("creates a NEW row with a unique opaque reference per attempt and sends that reference to the provider", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 7, buyer_id: 1, payment_method: "mobile_money", payment_status: "unpaid",
            shipping_phone: "0700000000", total_amount: 5000
        });
        paymentRepository.create.mockResolvedValue(42);
        mobileMoneyProvider.initiate.mockResolvedValue({ success: true, transactionReference: "TXN-1" });

        const result = await paymentService.initiateMobileMoneyPayment(7, 1);
        await paymentService.initiateMobileMoneyPayment(7, 1);

        const firstRef = paymentRepository.create.mock.calls[0][4];
        const secondRef = paymentRepository.create.mock.calls[1][4];

        expect(firstRef).toMatch(/^ORDER-7-[0-9A-F]{12}$/);
        expect(secondRef).toMatch(/^ORDER-7-[0-9A-F]{12}$/);
        expect(firstRef).not.toBe(secondRef);
        expect(mobileMoneyProvider.initiate.mock.calls[0][2].reference).toBe(firstRef);
        expect(paymentRepository.markPending).toHaveBeenCalledWith(42, "TXN-1");
        expect(paymentRepository.markCompleted).not.toHaveBeenCalled();
        expect(result.status).toBe("pending");
    });
});

describe("payment.service - handleProviderWebhook (reference routing)", () => {
    it("routes a legacy ORDER-<id> reference to the latest payment row of that order", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", purpose: "order_payment", amount: 1000 });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });

        const result = await paymentService.handleProviderWebhook({
            providerReference: "ORDER-5", success: true, transactionReference: "TXN-9"
        });

        expect(result.orderId).toBe(5);
        expect(result.success).toBe(true);
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(5, "paid");
    });

    it("matches a new-style reference to exactly the payment row that carries it (never the latest row)", async () => {
        paymentRepository.findByPaymentReference.mockResolvedValue({ id: 11, status: "pending", purpose: "order_payment", amount: 1000, payment_reference: REF });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });

        await paymentService.handleProviderWebhook({ providerReference: REF, success: true, transactionReference: "TXN-9" });

        expect(paymentRepository.findByPaymentReference).toHaveBeenCalledWith(REF);
        expect(paymentRepository.findByOrderId).not.toHaveBeenCalled();
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(11, "TXN-9", expect.any(String), null, null);
    });

    it("a callback from an old attempt cannot touch a newer attempt's row", async () => {
        // attempt 1's reference is not on any row we know -> permanent error, nothing applied
        paymentRepository.findByPaymentReference.mockResolvedValue(undefined);

        await expect(
            paymentService.handleProviderWebhook({ providerReference: "ORDER-5-AAAAAAAAAAAA", success: true })
        ).rejects.toMatchObject({ permanent: true });
        expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
    });

    it("throws a permanent error for an unrecognized reference format", async () => {
        await expect(
            paymentService.handleProviderWebhook({ providerReference: "garbage", success: true })
        ).rejects.toMatchObject({ permanent: true, message: expect.stringContaining("Unrecognized payment reference") });
    });

    // Regression coverage for the verification-fee retirement.
    it("no longer routes a VERIFY-<id> reference anywhere (verification fee retired)", async () => {
        await expect(
            paymentService.handleProviderWebhook({ providerReference: "VERIFY-8", success: true })
        ).rejects.toThrow("Unrecognized payment reference");
    });
});

describe("payment.service - _handleOrderPaymentWebhook", () => {
    it("throws a permanent error when there is no payment record for the order", async () => {
        paymentRepository.findByOrderId.mockResolvedValue(null);

        await expect(
            paymentService._handleOrderPaymentWebhook(99, true, "TXN")
        ).rejects.toMatchObject({ permanent: true, message: "No payment record found for order #99" });
    });

    it("is idempotent: a webhook retried after completion is a no-op", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed" });

        const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN");

        expect(result).toEqual({ alreadyProcessed: true });
        expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
    });

    it("a chargeback payment is final too - a later success is a no-op", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "chargeback" });

        expect(await paymentService._handleOrderPaymentWebhook(5, true, "TXN")).toEqual({ alreadyProcessed: true });
    });

    it("a failure on an already-failed payment is a no-op", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "failed" });

        const result = await paymentService._handleOrderPaymentWebhook(5, false, "TXN");

        expect(result).toEqual({ alreadyProcessed: true });
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
    });

    it("marks the payment failed (not completed) when a failure arrives for a pending payment", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, buyer_id: 2 });

        const result = await paymentService._handleOrderPaymentWebhook(5, false, "TXN");

        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
        expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
        expect(result).toEqual({ orderId: 5, success: false });
    });

    it("treats a failure as a no-op when the conditional update changed nothing (raced with a success)", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, buyer_id: 2 });
        paymentRepository.markFailed.mockResolvedValue(false);

        expect(await paymentService._handleOrderPaymentWebhook(5, false, "TXN")).toEqual({ alreadyProcessed: true });
    });

    it("claims, updates order status, and credits the seller wallet on success (single-vendor order)", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", purpose: "order_payment", amount: 5000 });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });

        const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN-1");

        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(1, "TXN-1", expect.stringMatching(/^RCPT-/), null, null);
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(5, "paid");
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(5);
        expect(result.success).toBe(true);
        expect(result.receiptNumber).toMatch(/^RCPT-/);
    });

    it("does nothing when another delivery already claimed the payment (concurrent duplicates)", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });
        paymentRepository.claimCompleted.mockResolvedValue(false);

        expect(await paymentService._handleOrderPaymentWebhook(5, true, "TXN")).toEqual({ alreadyProcessed: true });
        expect(walletService.creditSellersForOrder).not.toHaveBeenCalled();
        expect(orderRepository.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it("propagates payment status + wallet credit to every child order for a multi-vendor parent order", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", purpose: "order_payment", amount: 5000 });
        orderRepository.findOrderById.mockResolvedValue({ id: 100, is_parent: true, status: "pending", payment_status: "unpaid" });
        orderRepository.findChildOrders.mockResolvedValue([{ id: 101 }, { id: 102 }]);

        await paymentService._handleOrderPaymentWebhook(100, true, "TXN-1");

        expect(orderRepository.updatePaymentStatusForChildren).toHaveBeenCalledWith(100, "paid");
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(101);
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(102);
        expect(walletService.creditSellersForOrder).not.toHaveBeenCalledWith(100);
    });

    it("a rejected wallet-credit promise does not reject the webhook handler, but IS put in the admin review queue", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", purpose: "order_payment", amount: 5000 });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });
        walletService.creditSellersForOrder.mockRejectedValue(new Error("wallet db down"));

        await expect(paymentService._handleOrderPaymentWebhook(5, true, "TXN-1")).resolves.toMatchObject({ success: true });
        await new Promise((resolve) => setImmediate(resolve));

        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "apply_failed" }));
    });

    // ---- Late success on a payment already marked failed (P0) ----
    describe("late success on a failed payment", () => {
        it("completes and applies it (order still open) instead of dropping it as alreadyProcessed", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "failed", purpose: "order_payment", amount: 5000 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN-LATE");

            expect(result.alreadyProcessed).toBeUndefined();
            expect(result.success).toBe(true);
            expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(1, "TXN-LATE", expect.any(String), null, null);
            expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(5, "paid");
            expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(5);
        });

        it("flags requiresRefundReview, alerts admins and does NOT credit sellers when the order was cancelled meanwhile", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "failed", purpose: "order_payment", amount: 5000 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, buyer_id: 2, order_number: "N-5", status: "cancelled", payment_status: "unpaid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN-LATE");

            expect(result).toMatchObject({ success: false, cancelledOrderRefundNeeded: true, requiresRefundReview: true });
            expect(paymentRepository.claimCompleted).toHaveBeenCalled();
            expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "paid_after_cancel", severity: "critical" }));
            expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 2, messageKey: "notifications.payment.paidAfterCancel.message" }));
            expect(walletService.creditSellersForOrder).not.toHaveBeenCalled();
            expect(orderRepository.updatePaymentStatus).not.toHaveBeenCalled();
        });

        it("flags a duplicate payment (order already paid by another attempt) instead of crediting sellers twice", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 2, status: "failed", purpose: "order_payment", amount: 5000, payment_leg: "full" });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "confirmed", payment_status: "paid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN-DUP");

            expect(result).toMatchObject({ duplicatePayment: true, requiresRefundReview: true });
            expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "duplicate_payment" }));
            expect(walletService.creditSellersForOrder).not.toHaveBeenCalled();
        });
    });

    // ---- Amount checks ----
    describe("amount check", () => {
        it("routes a mismatched charged amount to review instead of marking the order paid", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", method: "snippe", amount: 10000 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, status: "pending", payment_status: "unpaid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN", null, null, { reportedAmount: 4000, reportedCurrency: "TZS" });

            expect(result).toMatchObject({ success: false, needsReview: true });
            expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "amount_mismatch", severity: "critical" }));
            expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
            expect(orderRepository.updatePaymentStatus).not.toHaveBeenCalled();
        });

        it("accepts an amount within the small tolerance", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", method: "snippe", amount: 10000 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN", null, null, { reportedAmount: 10001, reportedCurrency: "TZS" });

            expect(result.success).toBe(true);
        });

        it("flags a wrong currency as a mismatch", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", method: "snippe", amount: 10000 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, status: "pending", payment_status: "unpaid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN", null, null, { reportedAmount: 10000, reportedCurrency: "USD" });

            expect(result.needsReview).toBe(true);
        });

        it("compares PayPal captures with the USD amount fixed at creation", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", method: "paypal", amount: 23000, expected_usd_amount: 10 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, status: "pending", payment_status: "unpaid" });

            const result = await paymentService._handleOrderPaymentWebhook(5, true, "CAP", "USD", 3, { reportedAmount: 3, reportedCurrency: "USD" });

            expect(result.needsReview).toBe(true);
        });

        it("skips the check when the provider reports no amount", async () => {
            paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending", method: "mobile_money", amount: 10000 });
            orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });

            expect((await paymentService._handleOrderPaymentWebhook(5, true, "TXN")).success).toBe(true);
        });
    });
});

describe("payment.service - wallet top-ups", () => {
    const connection = db.__mockConnection;

    it("credits the wallet on success", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "pending", seller_id: 8, amount: 5000, purpose: "wallet_topup", method: "mobile_money" });

        const result = await paymentService._handleWalletTopupWebhook(20, true, "TXN");

        expect(result.success).toBe(true);
        // Wallet top-up atomic (Phase 2): claiming the payment, marking the
        // top-up completed and crediting the wallet all run on the SAME
        // connection, inside one beginTransaction/commit pair.
        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(3, "TXN", expect.any(String), null, null, connection);
        expect(buyerWalletRepository.markTopUpCompleted).toHaveBeenCalledWith(20, connection);
        expect(buyerWalletService.creditFromTopUp).toHaveBeenCalledWith(8, 5000, 20, connection);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("a late success on a FAILED top-up still credits the wallet", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "failed", seller_id: 8, amount: 5000, purpose: "wallet_topup", method: "mobile_money" });

        const result = await paymentService._handleWalletTopupWebhook(20, true, "TXN-LATE");

        expect(result.alreadyProcessed).toBeUndefined();
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(3, "TXN-LATE", expect.any(String), null, null, connection);
        expect(buyerWalletService.creditFromTopUp).toHaveBeenCalledWith(8, 5000, 20, connection);
    });

    it("does not credit twice when the payment was already completed", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "completed" });

        expect(await paymentService._handleWalletTopupWebhook(20, true, "TXN")).toEqual({ alreadyProcessed: true });
        expect(buyerWalletService.creditFromTopUp).not.toHaveBeenCalled();
        expect(connection.beginTransaction).not.toHaveBeenCalled();
    });

    it("a redelivered webhook after claimCompleted already failed its own race just no-ops, without touching the wallet", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "pending", seller_id: 8, amount: 5000, purpose: "wallet_topup", method: "mobile_money" });
        paymentRepository.claimCompleted.mockResolvedValueOnce(false);

        const result = await paymentService._handleWalletTopupWebhook(20, true, "TXN");

        expect(result).toEqual({ alreadyProcessed: true });
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(buyerWalletRepository.markTopUpCompleted).not.toHaveBeenCalled();
        expect(buyerWalletService.creditFromTopUp).not.toHaveBeenCalled();
    });

    // Wallet top-up atomic (Phase 2, P0): a credit failure now rolls back
    // the ENTIRE transaction (including the claim), rather than the
    // pre-Phase-2 behavior of leaving the payment "completed" with the
    // wallet never actually credited. It's still flagged for admin
    // visibility (nothing is silently swallowed), but it also rethrows -
    // unlike the old behavior, which absorbed the error and returned a
    // success-shaped response - so the caller (the webhook route) returns
    // a non-2xx and the provider redelivers into a clean retry instead of
    // another "already processed" no-op.
    it("a credit failure rolls back the whole transaction, flags it for review, and rethrows", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "pending", seller_id: 8, amount: 5000, purpose: "wallet_topup", method: "mobile_money" });
        buyerWalletService.creditFromTopUp.mockRejectedValue(new Error("db down"));

        await expect(paymentService._handleWalletTopupWebhook(20, true, "TXN")).rejects.toThrow("db down");

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "apply_failed" }));
    });

    it("marks the top-up failed on a failure event for a pending payment", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "pending" });

        expect(await paymentService._handleWalletTopupWebhook(20, false, "TXN")).toEqual({ topupId: 20, success: false });
        expect(buyerWalletRepository.markTopUpFailed).toHaveBeenCalledWith(20);
    });

    it("flags an amount mismatch instead of crediting", async () => {
        paymentRepository.findLatestByTopUpId.mockResolvedValue({ id: 3, status: "pending", method: "mobile_money", amount: 5000 });

        const result = await paymentService._handleWalletTopupWebhook(20, true, "TXN", null, null, { reportedAmount: 500 });

        expect(result.needsReview).toBe(true);
        expect(buyerWalletService.creditFromTopUp).not.toHaveBeenCalled();
        expect(connection.beginTransaction).not.toHaveBeenCalled();
    });
});

describe("payment.service - initiateWalletOrderPayment", () => {
    const connection = db.__mockConnection;

    const baseOrder = {
        id: 5, buyer_id: 1, payment_method: "wallet", payment_status: "unpaid",
        status: "pending", order_type: "standard", is_parent: false, total_amount: 2000
    };

    beforeEach(() => {
        orderRepository.findOrderByIdForUpdate.mockResolvedValue({ ...baseOrder });
        paymentRepository.create.mockResolvedValue(77);
        paymentRepository.claimCompleted.mockResolvedValue(true);
        buyerWalletService.debitForOrder.mockResolvedValue({ balanceAfter: 3000 });
        orderRepository.findChildOrders.mockResolvedValue([]);
    });

    it("locks the order row, debits the wallet, claims the payment and marks the order paid - all on the same connection, in one transaction", async () => {
        const result = await paymentService.initiateWalletOrderPayment(5, 1);

        expect(result.success).toBe(true);
        expect(orderRepository.findOrderByIdForUpdate).toHaveBeenCalledWith(5, connection);
        expect(paymentRepository.create).toHaveBeenCalledWith(5, "wallet", 2000, "full", expect.any(String), connection);
        expect(buyerWalletService.debitForOrder).toHaveBeenCalledWith(1, 2000, 5, 77, connection);
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(77, "WALLET-5", expect.any(String), null, 2000, connection);
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(5, "paid", connection);
        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("never debits the wallet when the order is already paid - rejects before the debit, inside the lock", async () => {
        orderRepository.findOrderByIdForUpdate.mockResolvedValue({ ...baseOrder, payment_status: "paid" });

        await expect(paymentService.initiateWalletOrderPayment(5, 1)).rejects.toThrow("already been paid");

        expect(buyerWalletService.debitForOrder).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("never debits the wallet when the order was cancelled", async () => {
        orderRepository.findOrderByIdForUpdate.mockResolvedValue({ ...baseOrder, status: "cancelled" });

        await expect(paymentService.initiateWalletOrderPayment(5, 1)).rejects.toThrow("cancelled");

        expect(buyerWalletService.debitForOrder).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
    });

    // Wallet order payment atomic (Phase 2, P0): the scenario this whole
    // rewrite exists to close - a second concurrent attempt reusing a
    // buyer's wallet locks on the SAME order row (mocked here simply as
    // "the debit throws", standing in for what a real second connection
    // blocked on MySQL's row lock would eventually see once it got in: the
    // order already marked paid). Either way, nothing about this request's
    // own debit should survive a failure anywhere in the sequence.
    it("rolls back the debit if marking the order paid fails afterward", async () => {
        orderRepository.updatePaymentStatus.mockRejectedValueOnce(new Error("db exploded"));

        await expect(paymentService.initiateWalletOrderPayment(5, 1)).rejects.toThrow("db exploded");

        expect(buyerWalletService.debitForOrder).toHaveBeenCalled(); // was attempted
        expect(connection.rollback).toHaveBeenCalled(); // ...but rolled back with everything else
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it("throws without debiting when the buyer doesn't own the order", async () => {
        orderRepository.findOrderByIdForUpdate.mockResolvedValue({ ...baseOrder, buyer_id: 999 });

        await expect(paymentService.initiateWalletOrderPayment(5, 1)).rejects.toThrow("Order not found");

        expect(buyerWalletService.debitForOrder).not.toHaveBeenCalled();
    });

    it("marks a pre-order's deposit leg paid (not the full order) and does not touch child orders", async () => {
        orderRepository.findOrderByIdForUpdate.mockResolvedValue({
            ...baseOrder, order_type: "pre_order", payment_status: "unpaid", total_amount: 500
        });

        const result = await paymentService.initiateWalletOrderPayment(5, 1);

        expect(result.paymentLeg).toBe("deposit");
        expect(orderRepository.markDepositPaid).toHaveBeenCalledWith(5, connection);
        expect(orderRepository.updatePaymentStatus).not.toHaveBeenCalled();
        expect(orderRepository.updatePaymentStatusForChildren).not.toHaveBeenCalled();
    });

    it("marks every child order paid for a multi-vendor order, in the same transaction as the parent", async () => {
        orderRepository.findOrderByIdForUpdate.mockResolvedValue({ ...baseOrder, is_parent: true });
        orderRepository.findChildOrders.mockResolvedValue([{ id: 6 }, { id: 7 }]);

        await paymentService.initiateWalletOrderPayment(5, 1);

        expect(orderRepository.updatePaymentStatusForChildren).toHaveBeenCalledWith(5, "paid", connection);
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(6);
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(7);
    });
});

describe("payment.service - subscriptions", () => {
    it("activates the subscription on success", async () => {
        paymentRepository.findLatestBySubscriptionId.mockResolvedValue({ id: 4, status: "pending", seller_id: 8, amount: 30000 });
        subscriptionRepository.findById.mockResolvedValue({ id: 9, status: "pending" });

        const result = await paymentService._handleSubscriptionPaymentWebhook(9, true, "TXN");

        expect(result.success).toBe(true);
        expect(subscriptionService.activateSubscription).toHaveBeenCalledWith(9);
    });

    it("a late success on a FAILED subscription payment still activates the plan", async () => {
        paymentRepository.findLatestBySubscriptionId.mockResolvedValue({ id: 4, status: "failed", seller_id: 8, amount: 30000 });
        subscriptionRepository.findById.mockResolvedValue({ id: 9, status: "pending" });

        const result = await paymentService._handleSubscriptionPaymentWebhook(9, true, "TXN-LATE");

        expect(result.alreadyProcessed).toBeUndefined();
        expect(subscriptionService.activateSubscription).toHaveBeenCalledWith(9);
    });

    it("flags the payment for refund review when the subscription can no longer be activated (already active)", async () => {
        paymentRepository.findLatestBySubscriptionId.mockResolvedValue({ id: 4, status: "failed", seller_id: 8, amount: 30000 });
        subscriptionRepository.findById.mockResolvedValue({ id: 9, status: "active" });

        const result = await paymentService._handleSubscriptionPaymentWebhook(9, true, "TXN-LATE");

        expect(result.requiresRefundReview).toBe(true);
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "duplicate_payment" }));
        expect(subscriptionService.activateSubscription).not.toHaveBeenCalled();
    });

    it("flags apply_failed when activation throws after the payment was claimed", async () => {
        paymentRepository.findLatestBySubscriptionId.mockResolvedValue({ id: 4, status: "pending", seller_id: 8, amount: 30000 });
        subscriptionRepository.findById.mockResolvedValue({ id: 9, status: "pending" });
        subscriptionService.activateSubscription.mockRejectedValue(new Error("boom"));

        const result = await paymentService._handleSubscriptionPaymentWebhook(9, true, "TXN");

        expect(result.applyFailed).toBe(true);
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "apply_failed" }));
    });
});

describe("payment.service - booking payments", () => {
    it("a late success on a failed booking payment is applied", async () => {
        paymentRepository.findByBookingId.mockResolvedValue({ id: 6, status: "failed", amount: 9000, purpose: "booking_payment" });
        bookingRepository.findById.mockResolvedValue({ id: 15, status: "pending", payment_status: "unpaid", customer_id: 1, provider_id: 2, booking_reference: "B-15" });

        const result = await paymentService._handleBookingPaymentWebhook(15, true, "TXN-LATE");

        expect(result.success).toBe(true);
        expect(bookingRepository.updatePaymentStatus).toHaveBeenCalledWith(15, "paid");
        expect(walletService.creditProvidersForBooking).toHaveBeenCalledWith(15);
    });

    it("flags a payment for a cancelled booking and does not credit the provider", async () => {
        paymentRepository.findByBookingId.mockResolvedValue({ id: 6, status: "failed", amount: 9000, purpose: "booking_payment" });
        bookingRepository.findById.mockResolvedValue({ id: 15, status: "cancelled", payment_status: "unpaid", customer_id: 1, provider_id: 2 });

        const result = await paymentService._handleBookingPaymentWebhook(15, true, "TXN-LATE");

        expect(result.requiresRefundReview).toBe(true);
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "paid_after_cancel" }));
        expect(walletService.creditProvidersForBooking).not.toHaveBeenCalled();
    });

    it("is idempotent for completed booking payments", async () => {
        paymentRepository.findByBookingId.mockResolvedValue({ id: 6, status: "completed" });

        expect(await paymentService._handleBookingPaymentWebhook(15, true, "TXN")).toEqual({ alreadyProcessed: true });
    });
});

describe("payment.service - hosted checkout events (Snippe / MalipoPay Card)", () => {
    const ref = "ORDER-12-0A1B2C3D4E5F";
    const paymentRow = { id: 1, status: "pending", purpose: "order_payment", method: "snippe", amount: 10000 };

    beforeEach(() => {
        paymentRepository.findByPaymentReference.mockResolvedValue(paymentRow);
        orderRepository.findOrderById.mockResolvedValue({ id: 12, is_parent: false, status: "pending", payment_status: "unpaid" });
    });

    it("ignores unrelated event types", async () => {
        expect(await paymentService.handleSnippeWebhookEvent({ type: "customer.updated" })).toEqual({ ignored: true });
    });

    it("applies a paid completed session and passes the reported amount to the amount check", async () => {
        const result = await paymentService.handleSnippeWebhookEvent({
            type: "checkout.session.completed",
            data: { reference: ref, payment_status: "paid", payment_id: "sess_123", amount_total: 10000, currency: "TZS" }
        });

        expect(result.orderId).toBe(12);
        expect(result.success).toBe(true);
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(1, "sess_123", expect.any(String), null, null);
    });

    it("ignores a 'completed' session whose payment_status is not paid yet (never marks it failed)", async () => {
        const result = await paymentService.handleSnippeWebhookEvent({
            type: "checkout.session.completed",
            data: { reference: ref, payment_status: "processing", id: "sess_1" }
        });

        expect(result).toEqual({ ignored: true });
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
    });

    it("marks the payment failed on an expired session event", async () => {
        const result = await paymentService.handleSnippeWebhookEvent({ type: "checkout.session.expired", data: { reference: ref, id: "sess_1" } });

        expect(result).toMatchObject({ orderId: 12, success: false });
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
    });

    it("routes a mismatched charged amount to review", async () => {
        const result = await paymentService.handleMalipopayCardWebhookEvent({
            type: "checkout.session.completed",
            data: { reference: ref, payment_status: "paid", id: "s", amount_total: 1 }
        });

        expect(result.needsReview).toBe(true);
    });

    it("hands dispute / chargeback events to the chargeback service", async () => {
        chargebackService.processChargeback.mockResolvedValue({ chargeback: true });

        const result = await paymentService.handleSnippeWebhookEvent({
            type: "payment.dispute.created",
            data: { reference: ref, reason: "fraudulent" }
        });

        expect(chargebackService.processChargeback).toHaveBeenCalledWith(paymentRow, "fraudulent");
        expect(result).toEqual({ chargeback: true });
    });
});

describe("payment.service - stale sweep provider check", () => {
    const stale = { id: 1, status: "pending", method: "mobile_money", purpose: "order_payment", order_id: 5, payment_reference: REF, transaction_reference: "TX" };

    beforeEach(() => {
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });
    });

    it("applies the payment when the provider says it actually succeeded (never fails it)", async () => {
        mobileMoneyProvider.checkStatus.mockResolvedValue({ state: "success", transactionReference: "TX2", amount: 5000 });
        stale.amount = 5000;

        const { outcome } = await paymentService.settleStalePayment(stale);

        expect(outcome).toBe("applied");
        expect(paymentRepository.claimCompleted).toHaveBeenCalled();
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
    });

    it("fails the payment only on a confirmed terminal failure", async () => {
        mobileMoneyProvider.checkStatus.mockResolvedValue({ state: "failed" });

        const { outcome } = await paymentService.settleStalePayment(stale);

        expect(outcome).toBe("failed");
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
    });

    it("leaves a still-pending payment alone", async () => {
        mobileMoneyProvider.checkStatus.mockResolvedValue({ state: "pending" });

        expect((await paymentService.settleStalePayment(stale)).outcome).toBe("still_pending");
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
    });

    it("leaves an unverifiable payment alone before the hard cutoff, fails it after", async () => {
        mobileMoneyProvider.checkStatus.mockResolvedValue({ state: "unknown" });

        expect((await paymentService.settleStalePayment(stale)).outcome).toBe("unverifiable");
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();

        expect((await paymentService.settleStalePayment(stale, { unverifiableCutoffPassed: true })).outcome).toBe("failed");
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
    });

    it("treats a provider lookup that throws as unknown, not as a failure", async () => {
        mobileMoneyProvider.checkStatus.mockRejectedValue(new Error("timeout"));

        expect((await paymentService.settleStalePayment(stale)).outcome).toBe("unverifiable");
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
    });

    it("reconciliation queues a payment the provider says was paid but we hold as failed", async () => {
        mobileMoneyProvider.checkStatus.mockResolvedValue({ state: "success", amount: 5000 });

        const result = await paymentService.reconcileUnsettledPayment({ ...stale, status: "failed" });

        expect(result.flagged).toBe(true);
        expect(paymentReviewService.flag).toHaveBeenCalledWith(expect.objectContaining({ reason: "provider_completed_not_here" }));
        expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
    });

    it("reconciliation ignores payments the provider does not report as paid", async () => {
        mobileMoneyProvider.checkStatus.mockResolvedValue({ state: "failed" });

        expect((await paymentService.reconcileUnsettledPayment(stale)).flagged).toBe(false);
    });
});

describe("payment.service - initiateSnippeOrderPayment", () => {
    it("throws when the order isn't set up for Snippe", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "paypal", payment_status: "unpaid" });

        await expect(
            paymentService.initiateSnippeOrderPayment(1, 5, { successUrl: "https://x", cancelUrl: "https://x" })
        ).rejects.toThrow("not set up for Snippe");
    });

    it("creates a checkout session with the attempt's own reference and marks the payment pending", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "snippe", payment_status: "unpaid", total_amount: 10000 });
        paymentRepository.create.mockResolvedValue(3);
        snippeProvider.createCheckoutSession.mockResolvedValue({ sessionId: "sess_1", url: "https://snippe.co/checkout/sess_1" });

        const result = await paymentService.initiateSnippeOrderPayment(1, 5, { successUrl: "https://x", cancelUrl: "https://x" });

        const reference = paymentRepository.create.mock.calls[0][4];
        expect(snippeProvider.createCheckoutSession.mock.calls[0][0].reference).toBe(reference);
        expect(paymentRepository.markPending).toHaveBeenCalledWith(3, "sess_1");
        expect(result).toEqual({ status: "redirect", url: "https://snippe.co/checkout/sess_1" });
    });
});

describe("payment.service - initiatePaypalOrderPayment", () => {
    it("throws when the order isn't set up for PayPal", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "snippe", payment_status: "unpaid" });

        await expect(
            paymentService.initiatePaypalOrderPayment(1, 5, { returnUrl: "https://x", cancelUrl: "https://x" })
        ).rejects.toThrow("not set up for PayPal");
    });

    it("stores the USD amount and exchange rate on the payment row at creation", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "paypal", payment_status: "unpaid", total_amount: 23000 });
        paymentRepository.create.mockResolvedValue(4);
        settingsService.getUsdExchangeRate.mockResolvedValue(2300);
        paypalProvider.createOrder.mockResolvedValue({ paypalOrderId: "PP-1", approveUrl: "https://paypal.com/approve", usdAmount: 10 });

        const result = await paymentService.initiatePaypalOrderPayment(1, 5, { returnUrl: "https://x", cancelUrl: "https://x" });

        expect(paymentRepository.markPendingPaypal).toHaveBeenCalledWith(4, "PP-1", { expectedUsdAmount: 10, usdExchangeRate: 2300 });
        expect(result).toEqual({ status: "redirect", url: "https://paypal.com/approve", usdAmount: 10 });
    });
});

describe("payment.service - capturePaypalPayment", () => {
    const paypalRow = { id: 1, status: "pending", method: "paypal", purpose: "order_payment", order_id: 5, amount: 23000, expected_usd_amount: 10, payment_reference: REF };

    beforeEach(() => {
        paypalProvider.assertValidOrderId.mockImplementation(() => {});
        paymentRepository.findByTransactionReference.mockResolvedValue(paypalRow);
        orderRepository.findOrderById.mockResolvedValue({ id: 5, buyer_id: 7, is_parent: false, status: "pending", payment_status: "unpaid" });
    });

    it("captures with the payment's reference as PayPal-Request-Id and applies a completed capture", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ state: "success", transactionReference: "CAP-1", amount: 10, currency: "USD" });

        const result = await paymentService.capturePaypalPayment("PP-1", 7);

        expect(paypalProvider.captureOrder).toHaveBeenCalledWith("PP-1", { requestId: REF });
        expect(result.success).toBe(true);
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(1, "CAP-1", expect.any(String), "USD", 10);
    });

    it("rejects a malformed PayPal order id before doing anything", async () => {
        paypalProvider.assertValidOrderId.mockImplementation(() => { throw new Error("Invalid PayPal order id"); });

        await expect(paymentService.capturePaypalPayment("../x", 7)).rejects.toThrow("Invalid PayPal order id");
        expect(paypalProvider.captureOrder).not.toHaveBeenCalled();
    });

    it("rejects a payment row that belongs to someone else", async () => {
        await expect(paymentService.capturePaypalPayment("PP-1", 999)).rejects.toThrow("Payment not found");
        expect(paypalProvider.captureOrder).not.toHaveBeenCalled();
    });

    it("rejects an id that matches no PayPal payment of ours", async () => {
        paymentRepository.findByTransactionReference.mockResolvedValue(undefined);

        await expect(paymentService.capturePaypalPayment("PP-9", 7)).rejects.toThrow("Payment not found");
    });

    it("a definite decline is written as a failure", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ state: "failed" });

        const result = await paymentService.capturePaypalPayment("PP-1", 7);

        expect(result).toMatchObject({ success: false });
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
    });

    it("an unclear capture is re-fetched first; a completed order is applied", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ state: "unknown" });
        paypalProvider.getOrder.mockResolvedValue({ state: "success", transactionReference: "CAP-2", amount: 10, currency: "USD" });

        const result = await paymentService.capturePaypalPayment("PP-1", 7);

        expect(paypalProvider.getOrder).toHaveBeenCalledWith("PP-1");
        expect(result.success).toBe(true);
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
    });

    it("an unclear capture that cannot be settled is left pending - NOT written as failed", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ state: "unknown" });
        paypalProvider.getOrder.mockRejectedValue(new Error("PayPal down"));

        const result = await paymentService.capturePaypalPayment("PP-1", 7);

        expect(result.status).toBe("pending");
        expect(paymentRepository.markFailed).not.toHaveBeenCalled();
        expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
    });

    it("flags a capture whose USD amount differs from what we asked PayPal to charge", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ state: "success", transactionReference: "CAP-3", amount: 4, currency: "USD" });

        const result = await paymentService.capturePaypalPayment("PP-1", 7);

        expect(result.needsReview).toBe(true);
        expect(paymentRepository.claimCompleted).not.toHaveBeenCalled();
    });

    it("an already-completed payment is reported as success without capturing again", async () => {
        paymentRepository.findByTransactionReference.mockResolvedValue({ ...paypalRow, status: "completed" });

        expect(await paymentService.capturePaypalPayment("PP-1", 7)).toEqual({ alreadyProcessed: true, success: true });
        expect(paypalProvider.captureOrder).not.toHaveBeenCalled();
    });
});

describe("payment.service - PayPal webhook events", () => {
    const paypalRow = { id: 1, status: "pending", method: "paypal", purpose: "order_payment", order_id: 5, amount: 23000, expected_usd_amount: 10, payment_reference: REF };

    beforeEach(() => {
        paymentRepository.findByPaymentReference.mockResolvedValue(paypalRow);
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false, status: "pending", payment_status: "unpaid" });
    });

    it("applies PAYMENT.CAPTURE.COMPLETED, matching the row through custom_id", async () => {
        const result = await paymentService.handlePaypalWebhookEvent({
            id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED",
            resource: { id: "CAP-9", custom_id: REF, amount: { value: "10.00", currency_code: "USD" } }
        });

        expect(result.success).toBe(true);
        expect(paymentRepository.claimCompleted).toHaveBeenCalledWith(1, "CAP-9", expect.any(String), "USD", 10);
    });

    it("marks a pending payment failed on PAYMENT.CAPTURE.DENIED", async () => {
        const result = await paymentService.handlePaypalWebhookEvent({
            id: "WH-2", event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: "CAP-9", custom_id: REF }
        });

        expect(result.success).toBe(false);
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
    });

    it("hands PAYMENT.CAPTURE.REVERSED to the chargeback service", async () => {
        chargebackService.processChargeback.mockResolvedValue({ chargeback: true });

        await paymentService.handlePaypalWebhookEvent({
            id: "WH-3", event_type: "PAYMENT.CAPTURE.REVERSED", resource: { id: "CAP-9", custom_id: REF }
        });

        expect(chargebackService.processChargeback).toHaveBeenCalledWith(paypalRow, expect.any(String));
    });

    it("ignores other event types (PENDING captures, our own refunds)", async () => {
        expect(await paymentService.handlePaypalWebhookEvent({ id: "WH-4", event_type: "PAYMENT.CAPTURE.PENDING", resource: {} })).toEqual({ ignored: true });
        expect(await paymentService.handlePaypalWebhookEvent({ id: "WH-5", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: {} })).toEqual({ ignored: true });
    });
});

describe("payment.service - getPayment", () => {
    it("throws when the order doesn't exist", async () => {
        orderRepository.findOrderById.mockResolvedValue(null);
        await expect(paymentService.getPayment(1, 5)).rejects.toThrow("Order not found");
    });

    it("throws (as 'not found', not 'forbidden') for a user with no relation to the order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);

        await expect(paymentService.getPayment(1, 5)).rejects.toThrow("Order not found");
    });

    it("allows the buyer to view their own order's payment", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed" });

        const payment = await paymentService.getPayment(1, 5);
        expect(payment.status).toBe("completed");
    });

    it("allows a seller with an item in the order to view it too", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });

        const payment = await paymentService.getPayment(1, 5);
        expect(payment.status).toBe("pending");
    });

    it("throws when the order exists but has no payment record yet", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5 });
        paymentRepository.findByOrderId.mockResolvedValue(null);

        await expect(paymentService.getPayment(1, 5)).rejects.toThrow("No payment record");
    });
});

// migration 061 replaced the old seller-self-reported confirmCashOnDelivery
// with a buyer-confirmed flow - a seller claiming "I got paid" was never
// actually proof of anything, so it's the buyer who confirms receipt now.
describe("payment.service - confirmDeliveryReceipt", () => {
    it("throws if the order doesn't belong to this buyer", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 999 });

        await expect(paymentService.confirmDeliveryReceipt(1, 55)).rejects.toThrow("Order not found");
    });

    it("throws if the order hasn't been delivered yet", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 55, status: "shipped" });

        await expect(paymentService.confirmDeliveryReceipt(1, 55)).rejects.toThrow("only confirm receipt after the order has been marked delivered");
    });

    it("throws if receipt has already been confirmed", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 55, status: "delivered", buyer_confirmed_at: new Date() });

        await expect(paymentService.confirmDeliveryReceipt(1, 55)).rejects.toThrow("already confirmed receipt");
    });

    it("marks the order confirmed with no payment side effect for a non-COD order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 55, status: "delivered", payment_method: "mobile_money" });

        const result = await paymentService.confirmDeliveryReceipt(1, 55);

        expect(orderRepository.markBuyerConfirmed).toHaveBeenCalledWith(1);
        expect(paymentRepository.markCompleted).not.toHaveBeenCalled();
        expect(result).toEqual({ confirmed: true, paymentConfirmed: false });
    });

    it("throws for a Cash on Delivery order that wasn't delivered by the seller's own agent", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 55, status: "delivered", payment_method: "cash_on_delivery", delivery_mode: "platform_pool"
        });

        await expect(paymentService.confirmDeliveryReceipt(1, 55)).rejects.toThrow("only available for orders delivered by the seller's own delivery agent");
    });

    it("marks the payment completed, order paid, and credits the seller wallet for Cash on Delivery", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 55, status: "delivered", payment_method: "cash_on_delivery", delivery_mode: "own", total_amount: 15000
        });
        paymentRepository.findByOrderId.mockResolvedValue(null);
        paymentRepository.create.mockResolvedValue(77);
        walletService.creditSellersForOrder.mockResolvedValue(undefined);

        const result = await paymentService.confirmDeliveryReceipt(1, 55);

        expect(orderRepository.markBuyerConfirmed).toHaveBeenCalledWith(1);
        expect(paymentRepository.markCompleted).toHaveBeenCalledWith(77, null, expect.stringMatching(/^RCPT-/));
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(1, "paid");
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(1);
        expect(result).toEqual(expect.objectContaining({ confirmed: true, paymentConfirmed: true }));
        expect(result.receiptNumber).toMatch(/^RCPT-/);
    });
});
