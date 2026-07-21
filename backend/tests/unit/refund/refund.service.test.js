jest.mock("../../../src/modules/refund/refund.repository");
jest.mock("../../../src/modules/payment/payment.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/audit/audit.service");
jest.mock("../../../src/modules/payment/providers/mobileMoney.provider");
jest.mock("../../../src/modules/payment/providers/snippe.provider");
jest.mock("../../../src/modules/payment/providers/paypal.provider");

const refundRepository = require("../../../src/modules/refund/refund.repository");
const paymentRepository = require("../../../src/modules/payment/payment.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const auditService = require("../../../src/modules/audit/audit.service");
const mobileMoneyProvider = require("../../../src/modules/payment/providers/mobileMoney.provider");
const snippeProvider = require("../../../src/modules/payment/providers/snippe.provider");
const paypalProvider = require("../../../src/modules/payment/providers/paypal.provider");

const refundService = require("../../../src/modules/refund/refund.service");

const dispute = { id: 5, order_id: 42, buyer_id: 7, seller_id: 9 };

const baseRefundRow = (overrides = {}) => ({
    id: 100,
    dispute_id: 5,
    payment_id: 1,
    order_id: 42,
    buyer_id: 7,
    seller_id: 9,
    provider: "mobile_money",
    amount: 5000,
    status: "pending",
    ...overrides
});

beforeEach(() => {
    // Make the exponential backoff between retries a no-op in tests.
    jest.spyOn(global, "setTimeout").mockImplementation((fn) => fn());
    refundRepository.markProcessing.mockResolvedValue(undefined);
    refundRepository.markCompleted.mockResolvedValue(undefined);
    refundRepository.markFailed.mockResolvedValue(undefined);
    refundRepository.markManualRequired.mockResolvedValue(undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("refund.service.autoRefundForDispute", () => {
    it("marks manual_required when there's no completed payment for the order", async () => {
        paymentRepository.findByOrderId.mockResolvedValue(null);

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("manual_required");
        expect(refundRepository.create).not.toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: "refund.manual_required" })
        );
    });

    it("is idempotent: a second trigger for the same dispute reuses the existing refund row instead of creating another", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "mobile_money" });
        refundRepository.findByDisputeId.mockResolvedValue(baseRefundRow({ status: "completed" }));

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("completed");
        expect(refundRepository.create).not.toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: "refund.duplicate_trigger_skipped" })
        );
    });

    it("recovers cleanly from a duplicate-key race (two concurrent triggers) instead of throwing", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "mobile_money" });
        refundRepository.findByDisputeId
            .mockResolvedValueOnce(undefined) // first lookup: nothing yet
            .mockResolvedValueOnce(baseRefundRow({ status: "processing" })); // lost the race
        const dupError = new Error("Duplicate entry");
        dupError.code = "ER_DUP_ENTRY";
        refundRepository.create.mockRejectedValue(dupError);

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("processing");
    });

    it("goes straight to manual_required for cash on delivery (no online reversal possible)", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "cash_on_delivery" });
        refundRepository.findByDisputeId.mockResolvedValue(undefined);
        refundRepository.create.mockResolvedValue(100);
        refundRepository.findById.mockResolvedValue(baseRefundRow({ provider: "cash_on_delivery" }));

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("manual_required");
        expect(refundRepository.markManualRequired).toHaveBeenCalledWith(100, expect.stringContaining("Cash on delivery"));
    });

    it("completes a mobile money refund on the first attempt and records the provider reference", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "mobile_money" });
        refundRepository.findByDisputeId.mockResolvedValue(undefined);
        refundRepository.create.mockResolvedValue(100);
        refundRepository.findById.mockResolvedValue(baseRefundRow());
        orderRepository.findOrderById.mockResolvedValue({ id: 42, shipping_phone: "+255700000000" });
        mobileMoneyProvider.refund.mockResolvedValue({ success: true, transactionReference: "MM-REFUND-1" });

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("completed");
        expect(refundRepository.markCompleted).toHaveBeenCalledWith(100, "MM-REFUND-1");
        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "refund.completed" }));
    });

    it("retries up to 3 times then marks the refund failed when the provider keeps declining", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "mobile_money" });
        refundRepository.findByDisputeId.mockResolvedValue(undefined);
        refundRepository.create.mockResolvedValue(100);
        refundRepository.findById.mockResolvedValue(baseRefundRow());
        orderRepository.findOrderById.mockResolvedValue({ id: 42, shipping_phone: "+255700000000" });
        mobileMoneyProvider.refund.mockResolvedValue({ success: false, transactionReference: null });

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("failed");
        expect(mobileMoneyProvider.refund).toHaveBeenCalledTimes(3);
        expect(refundRepository.markFailed).toHaveBeenCalledWith(100, expect.any(String));
        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "refund.failed" }));
    });

    it("retries after a thrown provider error and succeeds on a later attempt", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "snippe", transaction_reference: "SNIPPE-1" });
        refundRepository.findByDisputeId.mockResolvedValue(undefined);
        refundRepository.create.mockResolvedValue(100);
        refundRepository.findById.mockResolvedValue(baseRefundRow({ provider: "snippe" }));
        snippeProvider.refundPayment
            .mockRejectedValueOnce(new Error("network timeout"))
            .mockResolvedValueOnce({ success: true, refundReference: "SNIPPE-REFUND-1" });

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("completed");
        expect(snippeProvider.refundPayment).toHaveBeenCalledTimes(2);
        expect(refundRepository.markCompleted).toHaveBeenCalledWith(100, "SNIPPE-REFUND-1");
    });

    it("computes a proportional USD amount for a PayPal partial refund", async () => {
        paymentRepository.findByOrderId.mockResolvedValue({
            id: 1, status: "completed", method: "paypal",
            transaction_reference: "CAPTURE-1", amount: "10000.00", charged_amount: "4.00"
        });
        refundRepository.findByDisputeId.mockResolvedValue(undefined);
        refundRepository.create.mockResolvedValue(100);
        refundRepository.findById.mockResolvedValue(baseRefundRow({ provider: "paypal", amount: 5000 }));
        paypalProvider.refundCapture.mockResolvedValue({ success: true, refundReference: "REFUND-CAP-1" });

        const result = await refundService.autoRefundForDispute({ dispute, amount: 5000, requestedBy: 1 });

        expect(result.status).toBe("completed");
        // 5000/10000 * 4.00 = 2.00
        expect(paypalProvider.refundCapture).toHaveBeenCalledWith("CAPTURE-1", 2.00);
    });
});

describe("refund.service.retryRefund", () => {
    it("refuses to retry a refund that's already completed", async () => {
        refundRepository.findById.mockResolvedValue(baseRefundRow({ status: "completed" }));

        await expect(refundService.retryRefund(100, 1)).rejects.toThrow(/already "completed"/);
    });

    it("retries a failed refund and can succeed", async () => {
        refundRepository.findById.mockResolvedValue(baseRefundRow({ status: "failed" }));
        paymentRepository.findByOrderId.mockResolvedValue({ id: 1, status: "completed", method: "mobile_money" });
        orderRepository.findOrderById.mockResolvedValue({ id: 42, shipping_phone: "+255700000000" });
        mobileMoneyProvider.refund.mockResolvedValue({ success: true, transactionReference: "MM-REFUND-2" });

        const result = await refundService.retryRefund(100, 1);

        expect(result.status).toBe("completed");
        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "refund.manual_retry" }));
    });
});
