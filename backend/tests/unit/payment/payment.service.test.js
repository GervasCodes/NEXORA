// Repositories/providers/cross-module collaborators are mocked so these
// tests exercise payment.service's own branching logic (idempotency,
// reference-parsing, status checks) in isolation - no DB, no network.
jest.mock("../../../src/modules/payment/payment.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/payment/providers/mobileMoney.provider");
jest.mock("../../../src/modules/payment/providers/snippe.provider");
jest.mock("../../../src/modules/payment/providers/paypal.provider");
jest.mock("../../../src/modules/wallet/wallet.service");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/socket/socket", () => ({ emitToAdmins: jest.fn() }), { virtual: true });

const paymentRepository = require("../../../src/modules/payment/payment.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const mobileMoneyProvider = require("../../../src/modules/payment/providers/mobileMoney.provider");
const snippeProvider = require("../../../src/modules/payment/providers/snippe.provider");
const paypalProvider = require("../../../src/modules/payment/providers/paypal.provider");
const walletService = require("../../../src/modules/wallet/wallet.service");
const settingsService = require("../../../src/modules/settings/settings.service");

const paymentService = require("../../../src/modules/payment/payment.service");

beforeEach(() => {
    walletService.creditSellersForOrder.mockResolvedValue(undefined);
});

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

    it("marks the payment failed and re-throws when the provider call itself errors", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, buyer_id: 1, payment_method: "mobile_money", payment_status: "unpaid",
            shipping_phone: "0700000000", total_amount: 5000
        });
        paymentRepository.findByOrderId.mockResolvedValue(null);
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
        paymentRepository.findByOrderId.mockResolvedValue({ id: 42 });
        mobileMoneyProvider.initiate.mockResolvedValue({ success: false });

        await expect(paymentService.initiateMobileMoneyPayment(1, 1)).rejects.toThrow("Payment could not be initiated");
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(42);
    });

    it("marks pending (never completed) on a successful initiate - webhook decides completion", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 7, buyer_id: 1, payment_method: "mobile_money", payment_status: "unpaid",
            shipping_phone: "0700000000", total_amount: 5000
        });
        paymentRepository.findByOrderId.mockResolvedValue({ id: 42 });
        mobileMoneyProvider.initiate.mockResolvedValue({ success: true, transactionReference: "TXN-1" });

        const result = await paymentService.initiateMobileMoneyPayment(7, 1);

        expect(paymentRepository.markPending).toHaveBeenCalledWith(42, "TXN-1");
        expect(paymentRepository.markCompleted).not.toHaveBeenCalled();
        expect(result.status).toBe("pending");
    });
});

describe("payment.service - handleProviderWebhook (reference routing)", () => {
    it("routes an ORDER-<id> reference to the order webhook handler", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false });

        const result = await paymentService.handleProviderWebhook({
            providerReference: "ORDER-5", success: true, transactionReference: "TXN-9"
        });

        expect(result.orderId).toBe(5);
        expect(result.success).toBe(true);
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(5, "paid");
    });

    it("routes a VERIFY-<id> reference to the verification-fee webhook handler", async () => {
        paymentRepository.findPendingVerificationFeePayment.mockResolvedValue({ id: 8, amount: 20000 });
        jest.doMock("../../../src/modules/seller/seller.service", () => ({
            confirmVerificationFeePaid: jest.fn().mockResolvedValue(undefined)
        }), { virtual: true });

        const result = await paymentService.handleProviderWebhook({
            providerReference: "VERIFY-8", success: true, transactionReference: "TXN-10"
        });

        expect(result.sellerId).toBe(8);
        expect(result.success).toBe(true);
    });

    it("throws for an unrecognized reference format", async () => {
        await expect(
            paymentService.handleProviderWebhook({ providerReference: "garbage", success: true })
        ).rejects.toThrow("Unrecognized payment reference");
    });
});

describe("payment.service - _handleOrderPaymentWebhook", () => {
    it("throws when there is no payment record for the order", async () => {
        paymentRepository.findByOrderId.mockResolvedValue(null);

        await expect(
            paymentService._handleOrderPaymentWebhook(99, true, "TXN")
        ).rejects.toThrow("No payment record found for order #99");
    });

    it("is idempotent: a webhook retried after completion is a no-op", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed" });

        const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN");

        expect(result).toEqual({ alreadyProcessed: true });
        expect(paymentRepository.markCompleted).not.toHaveBeenCalled();
    });

    it("is idempotent for an already-failed payment too", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "failed" });

        const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN");

        expect(result).toEqual({ alreadyProcessed: true });
    });

    it("marks the payment failed (not completed) when success is false", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });

        const result = await paymentService._handleOrderPaymentWebhook(5, false, "TXN");

        expect(paymentRepository.markFailed).toHaveBeenCalledWith(1);
        expect(paymentRepository.markCompleted).not.toHaveBeenCalled();
        expect(result).toEqual({ orderId: 5, success: false });
    });

    it("marks completed, updates order status, and credits the seller wallet on success (single-vendor order)", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false });
        walletService.creditSellersForOrder.mockResolvedValue(undefined);

        const result = await paymentService._handleOrderPaymentWebhook(5, true, "TXN-1");

        expect(paymentRepository.markCompleted).toHaveBeenCalledWith(1, "TXN-1", expect.stringMatching(/^RCPT-/), null, null);
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(5, "paid");
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(5);
        expect(result.success).toBe(true);
        expect(result.receiptNumber).toMatch(/^RCPT-/);
    });

    it("propagates payment status + wallet credit to every child order for a multi-vendor parent order", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 100, is_parent: true });
        orderRepository.findChildOrders.mockResolvedValue([{ id: 101 }, { id: 102 }]);
        walletService.creditSellersForOrder.mockResolvedValue(undefined);

        await paymentService._handleOrderPaymentWebhook(100, true, "TXN-1");

        expect(orderRepository.updatePaymentStatusForChildren).toHaveBeenCalledWith(100, "paid");
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(101);
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(102);
        // The parent order itself is never credited directly - only children carry order_items.
        expect(walletService.creditSellersForOrder).not.toHaveBeenCalledWith(100);
    });

    it("does not let a rejected wallet-credit promise reject the webhook handler itself (fire-and-forget)", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false });
        walletService.creditSellersForOrder.mockRejectedValue(new Error("wallet db down"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await expect(paymentService._handleOrderPaymentWebhook(5, true, "TXN-1")).resolves.toMatchObject({ success: true });

        consoleSpy.mockRestore();
    });
});

describe("payment.service - _handleVerificationFeeWebhook", () => {
    it("is a no-op when there's no pending verification-fee payment (already processed or never initiated)", async () => {
        paymentRepository.findPendingVerificationFeePayment.mockResolvedValue(null);

        const result = await paymentService._handleVerificationFeeWebhook(3, true, "TXN");

        expect(result).toEqual({ alreadyProcessed: true });
    });

    it("marks failed on a failed verification-fee webhook", async () => {
        paymentRepository.findPendingVerificationFeePayment.mockResolvedValue({ id: 9, amount: 20000 });

        const result = await paymentService._handleVerificationFeeWebhook(3, false, "TXN");

        expect(paymentRepository.markFailed).toHaveBeenCalledWith(9);
        expect(result).toEqual({ sellerId: 3, success: false });
    });
});

describe("payment.service - handleSnippeWebhookEvent", () => {
    it("ignores any event type other than checkout.session.completed", async () => {
        const result = await paymentService.handleSnippeWebhookEvent({ type: "checkout.session.expired" });
        expect(result).toEqual({ ignored: true });
    });

    it("extracts the reference/success/transactionReference and delegates to handleProviderWebhook", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 12, is_parent: false });
        walletService.creditSellersForOrder.mockResolvedValue(undefined);

        const event = {
            type: "checkout.session.completed",
            data: { reference: "ORDER-12", payment_status: "paid", payment_id: "sess_123" }
        };

        const result = await paymentService.handleSnippeWebhookEvent(event);

        expect(result.orderId).toBe(12);
        expect(result.success).toBe(true);
        expect(paymentRepository.markCompleted).toHaveBeenCalledWith(1, "sess_123", expect.any(String), null, null);
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

describe("payment.service - initiateSnippeOrderPayment", () => {
    it("throws when the order isn't set up for Snippe", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "paypal", payment_status: "unpaid" });

        await expect(
            paymentService.initiateSnippeOrderPayment(1, 5, { successUrl: "https://x", cancelUrl: "https://x" })
        ).rejects.toThrow("not set up for Snippe");
    });

    it("creates a checkout session and marks the payment pending on success", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "snippe", payment_status: "unpaid", total_amount: 10000 });
        paymentRepository.findByOrderId.mockResolvedValue(null);
        paymentRepository.create.mockResolvedValue(3);
        snippeProvider.createCheckoutSession.mockResolvedValue({ sessionId: "sess_1", url: "https://snippe.co/checkout/sess_1" });

        const result = await paymentService.initiateSnippeOrderPayment(1, 5, { successUrl: "https://x", cancelUrl: "https://x" });

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

    it("converts to USD via the current exchange rate and marks the payment pending", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, buyer_id: 5, payment_method: "paypal", payment_status: "unpaid", total_amount: 23000 });
        paymentRepository.findByOrderId.mockResolvedValue(null);
        paymentRepository.create.mockResolvedValue(4);
        settingsService.getUsdExchangeRate.mockResolvedValue(2300);
        paypalProvider.createOrder.mockResolvedValue({ paypalOrderId: "PP-1", approveUrl: "https://paypal.com/approve", usdAmount: 10 });

        const result = await paymentService.initiatePaypalOrderPayment(1, 5, { returnUrl: "https://x", cancelUrl: "https://x" });

        expect(paymentRepository.markPending).toHaveBeenCalledWith(4, "PP-1");
        expect(result).toEqual({ status: "redirect", url: "https://paypal.com/approve", usdAmount: 10 });
    });
});

describe("payment.service - capturePaypalPayment", () => {
    it("resolves the reference from PayPal's own capture response when present", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ success: true, reference: "ORDER-5", transactionReference: "CAP-1" });
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "pending" });
        orderRepository.findOrderById.mockResolvedValue({ id: 5, is_parent: false });
        paymentRepository.findByTransactionReference.mockResolvedValue({ amount: 23000 });
        settingsService.getUsdExchangeRate.mockResolvedValue(2300);

        const result = await paymentService.capturePaypalPayment("PP-1");

        expect(result.orderId).toBe(5);
        expect(result.success).toBe(true);
        expect(paymentRepository.markCompleted).toHaveBeenCalledWith(1, "CAP-1", expect.any(String), "USD", 10);
    });

    it("falls back to looking up the reference by our own stored payment row when PayPal doesn't echo one back", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ success: true, reference: null, transactionReference: "CAP-2" });
        paymentRepository.findByTransactionReference.mockResolvedValue({ purpose: "seller_verification_fee", seller_id: 8, amount: 20000 });
        paymentRepository.findPendingVerificationFeePayment.mockResolvedValue({ id: 9, amount: 20000 });
        settingsService.getUsdExchangeRate.mockResolvedValue(2300);

        const result = await paymentService.capturePaypalPayment("PP-2");

        expect(result.sellerId).toBe(8);
        expect(result.success).toBe(true);
    });

    it("throws if no reference can be determined at all (capture succeeded but we have no matching payment row)", async () => {
        paypalProvider.captureOrder.mockResolvedValue({ success: true, reference: null, transactionReference: "CAP-3" });
        paymentRepository.findByTransactionReference.mockResolvedValue(null);

        await expect(paymentService.capturePaypalPayment("PP-3")).rejects.toThrow("Could not determine what this PayPal payment was for");
    });
});

describe("payment.service - initiateVerificationFeePayment (mobile money)", () => {
    it("marks failed and rethrows when the provider errors", async () => {
        paymentRepository.findPendingVerificationFeePayment.mockResolvedValue(null);
        paymentRepository.createVerificationFeePayment.mockResolvedValue(11);
        mobileMoneyProvider.initiate.mockRejectedValue(new Error("phone unreachable"));

        await expect(paymentService.initiateVerificationFeePayment(8, "0700000000", 20000)).rejects.toThrow("phone unreachable");
        expect(paymentRepository.markFailed).toHaveBeenCalledWith(11);
    });

    it("reuses an existing pending verification-fee payment instead of creating a duplicate", async () => {
        paymentRepository.findPendingVerificationFeePayment.mockResolvedValue({ id: 22 });
        mobileMoneyProvider.initiate.mockResolvedValue({ success: true, transactionReference: "TXN-22" });

        await paymentService.initiateVerificationFeePayment(8, "0700000000", 20000);

        expect(paymentRepository.createVerificationFeePayment).not.toHaveBeenCalled();
        expect(paymentRepository.markPending).toHaveBeenCalledWith(22, "TXN-22");
    });
});

describe("payment.service - confirmCashOnDelivery", () => {
    it("throws if the order doesn't belong to this seller", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1 });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(false);

        await expect(paymentService.confirmCashOnDelivery(1, 55)).rejects.toThrow("Order not found");
    });

    it("throws if the order isn't a cash_on_delivery order", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, payment_method: "mobile_money", status: "delivered" });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);

        await expect(paymentService.confirmCashOnDelivery(1, 55)).rejects.toThrow("not a Cash on Delivery order");
    });

    it("throws if the order hasn't been delivered yet", async () => {
        orderRepository.findOrderById.mockResolvedValue({ id: 1, payment_method: "cash_on_delivery", status: "shipped" });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);

        await expect(paymentService.confirmCashOnDelivery(1, 55)).rejects.toThrow("only be confirmed after delivery");
    });

    it("marks the payment completed, order paid, and credits the seller wallet once delivered", async () => {
        orderRepository.findOrderById.mockResolvedValue({
            id: 1, payment_method: "cash_on_delivery", status: "delivered", total_amount: 15000
        });
        orderRepository.sellerHasItemInOrder.mockResolvedValue(true);
        paymentRepository.findByOrderId.mockResolvedValue(null);
        paymentRepository.create.mockResolvedValue(77);
        walletService.creditSellersForOrder.mockResolvedValue(undefined);

        const result = await paymentService.confirmCashOnDelivery(1, 55);

        expect(paymentRepository.markCompleted).toHaveBeenCalledWith(77, null, expect.stringMatching(/^RCPT-/));
        expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(1, "paid");
        expect(walletService.creditSellersForOrder).toHaveBeenCalledWith(1);
        expect(result.receiptNumber).toMatch(/^RCPT-/);
    });
});
