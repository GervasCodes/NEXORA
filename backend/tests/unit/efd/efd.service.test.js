// TRA fiscal receipts (EFD). A receipt must carry the SELLER's own TIN, must never be issued for a seller
// whose registration an admin has not approved, must not be issued twice when a payment webhook is retried,
// and a refunded order needs a credit note. None of this had a test.
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    logger.child = () => logger;
    return logger;
});
jest.mock("../../../src/modules/efd/efd.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/efd/providers/efd.provider");

const Sentry = require("../../../src/config/sentry");
const efdRepository = require("../../../src/modules/efd/efd.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const efdProvider = require("../../../src/modules/efd/providers/efd.provider");
const service = require("../../../src/modules/efd/efd.service");

const SELLER = 20;
const BUYER = 10;
const registered = { tin: "123456789", vrn: "40-123456-A", efd_registered: 1 };

beforeEach(() => {
    jest.resetAllMocks();
    efdRepository.findByOrderId.mockResolvedValue(null);
    efdRepository.create.mockResolvedValue(77);
    efdRepository.findBuyerName.mockResolvedValue("Amina Juma");
    efdRepository.getSellerTaxInfo.mockResolvedValue(registered);
    orderRepository.findOrderItems.mockResolvedValue([{ id: 1, seller_id: SELLER }]);
    orderRepository.findOrderById.mockResolvedValue({ id: 5, buyer_id: BUYER, order_number: "NX-5", total_amount: "50000.00", shipping_phone: "255700000001" });
    efdProvider.submitInvoice.mockResolvedValue({ success: true, fiscalReceiptNumber: "FR-1", verificationCode: "VC-1", raw: { ok: true } });
    efdProvider.submitCreditNote.mockResolvedValue({ success: true });
});

describe("efd.service.registerTaxInfo", () => {
    it.each(["12345678", "1234567890", "12345678a", "", null, undefined, "123 456 789"])("rejects the TIN %p (must be exactly 9 digits)", async (tin) => {
        await expect(service.registerTaxInfo(SELLER, { tin })).rejects.toThrow("TIN must be exactly 9 digits");
        expect(efdRepository.setTaxInfo).not.toHaveBeenCalled();
    });

    it("rejects a VRN that is too short but allows none", async () => {
        await expect(service.registerTaxInfo(SELLER, { tin: "123456789", vrn: "abc" })).rejects.toThrow("Invalid VRN");
        await service.registerTaxInfo(SELLER, { tin: "123456789" });
        expect(efdRepository.setTaxInfo).toHaveBeenCalledWith(SELLER, "123456789", null);
    });

    it("stores a valid TIN and VRN and returns the stored tax info", async () => {
        efdRepository.getSellerTaxInfo.mockResolvedValue({ tin: "123456789", vrn: "40-123456-A", efd_registered: 0 });
        const result = await service.registerTaxInfo(SELLER, { tin: "123456789", vrn: "40-123456-A" });
        expect(efdRepository.setTaxInfo).toHaveBeenCalledWith(SELLER, "123456789", "40-123456-A");
        expect(result.efd_registered).toBe(0); // registering never approves itself
    });

    it("an admin decision approves or revokes the registration", async () => {
        await service.verifyRegistration(SELLER, true);
        expect(efdRepository.setEfdRegistered).toHaveBeenCalledWith(SELLER, true);
        await service.verifyRegistration(SELLER, false);
        expect(efdRepository.setEfdRegistered).toHaveBeenLastCalledWith(SELLER, false);
    });
});

describe("efd.service.issueReceiptForOrder", () => {
    it("submits the seller's own TIN/VRN and the order, then records the fiscal receipt", async () => {
        efdRepository.findByOrderId.mockResolvedValueOnce(null).mockResolvedValue({ id: 77, status: "issued" });
        const result = await service.issueReceiptForOrder(5);

        expect(efdRepository.create).toHaveBeenCalledWith(5, SELLER, "pending");
        expect(efdProvider.submitInvoice).toHaveBeenCalledWith(expect.objectContaining({
            sellerTin: "123456789", sellerVrn: "40-123456-A", buyerName: "Amina Juma", totalAmount: "50000.00", orderNumber: "NX-5"
        }));
        expect(efdRepository.markIssued).toHaveBeenCalledWith(77, { fiscalReceiptNumber: "FR-1", verificationCode: "VC-1", rawResponse: { ok: true } });
        expect(result.status).toBe("issued");
    });

    it("is idempotent: a retried payment webhook never submits a second receipt", async () => {
        efdRepository.findByOrderId.mockResolvedValue({ id: 3, status: "issued" });
        const result = await service.issueReceiptForOrder(5);
        expect(result).toEqual({ id: 3, status: "issued" });
        expect(efdProvider.submitInvoice).not.toHaveBeenCalled();
        expect(efdRepository.create).not.toHaveBeenCalled();
    });

    it("does nothing for an order with no items", async () => {
        orderRepository.findOrderItems.mockResolvedValue([]);
        expect(await service.issueReceiptForOrder(5)).toBeNull();
        expect(efdRepository.create).not.toHaveBeenCalled();
    });

    it.each([[null], [{ tin: "123456789", efd_registered: 0 }]])("records 'not_applicable' and submits nothing when the seller is not approved (%j)", async (tax) => {
        efdRepository.getSellerTaxInfo.mockResolvedValue(tax);
        efdRepository.findByOrderId.mockResolvedValueOnce(null).mockResolvedValue({ status: "not_applicable" });
        await service.issueReceiptForOrder(5);
        expect(efdRepository.create).toHaveBeenCalledWith(5, SELLER, "not_applicable");
        expect(efdProvider.submitInvoice).not.toHaveBeenCalled();
    });

    it("marks the receipt failed (for the admin queue and the retry job) when TRA rejects it", async () => {
        efdProvider.submitInvoice.mockResolvedValue({ success: false, error: "TIN not found" });
        await service.issueReceiptForOrder(5);
        expect(efdRepository.markFailed).toHaveBeenCalledWith(77, "TIN not found");
        expect(efdRepository.markIssued).not.toHaveBeenCalled();
    });

    it("marks it failed with a default message when TRA gives no error text", async () => {
        efdProvider.submitInvoice.mockResolvedValue({ success: false });
        await service.issueReceiptForOrder(5);
        expect(efdRepository.markFailed).toHaveBeenCalledWith(77, "TRA VFD submission failed");
    });

    it("survives a provider exception: marks failed, reports it, never throws into the payment flow", async () => {
        efdProvider.submitInvoice.mockRejectedValue(new Error("timeout"));
        await expect(service.issueReceiptForOrder(5)).resolves.toBeNull(); // returns the (mocked) stored row, does not throw
        expect(efdRepository.markFailed).toHaveBeenCalledWith(77, "timeout");
        expect(Sentry.captureException).toHaveBeenCalled();
    });

    it("uses a neutral buyer name when the buyer has none", async () => {
        efdRepository.findBuyerName.mockResolvedValue(null);
        await service.issueReceiptForOrder(5);
        expect(efdProvider.submitInvoice).toHaveBeenCalledWith(expect.objectContaining({ buyerName: "NEXORA customer" }));
    });
});

describe("efd.service.retryReceipt", () => {
    const row = { id: 77, order_id: 5, seller_id: SELLER, status: "failed" };

    it("fails clearly for an unknown receipt", async () => {
        efdRepository.findById.mockResolvedValue(null);
        await expect(service.retryReceipt(1)).rejects.toThrow("EFD receipt not found");
    });

    it("counts the attempt, resubmits and records success", async () => {
        efdRepository.findById.mockResolvedValue(row);
        await service.retryReceipt(77);
        expect(efdRepository.markRetried).toHaveBeenCalledWith(77);
        expect(efdProvider.submitInvoice).toHaveBeenCalledTimes(1);
        expect(efdRepository.markIssued).toHaveBeenCalledWith(77, expect.objectContaining({ fiscalReceiptNumber: "FR-1" }));
    });

    it("records another failure without throwing", async () => {
        efdProvider.submitInvoice.mockResolvedValue({ success: false });
        await service.retryReceiptRow(row);
        expect(efdRepository.markFailed).toHaveBeenCalledWith(77, "TRA VFD retry failed");
        efdProvider.submitInvoice.mockRejectedValue(new Error("network"));
        await expect(service.retryReceiptRow(row)).resolves.toBeNull(); // does not throw
        expect(efdRepository.markFailed).toHaveBeenLastCalledWith(77, "network");
        expect(Sentry.captureException).toHaveBeenCalled();
    });
});

describe("efd.service.issueCreditNoteForOrder (a refunded order must cancel its fiscal receipt)", () => {
    const issued = { id: 77, status: "issued", fiscal_receipt_number: "FR-1", verification_code: "VC-1", credit_note_status: null };

    it.each([[null], [{ ...issued, status: "failed" }], [{ ...issued, status: "not_applicable" }], [{ ...issued, credit_note_status: "issued" }]])(
        "does nothing when there is nothing to cancel (%j)", async (receipt) => {
            efdRepository.findByOrderId.mockResolvedValue(receipt);
            expect(await service.issueCreditNoteForOrder(5, "refund")).toBeNull();
            expect(efdProvider.submitCreditNote).not.toHaveBeenCalled();
        });

    it("cancels an issued receipt against the original fiscal number and records it", async () => {
        efdRepository.findByOrderId.mockResolvedValue(issued);
        const result = await service.issueCreditNoteForOrder(5, "Dispute refund");
        expect(efdRepository.setCreditNoteStatus).toHaveBeenNthCalledWith(1, 77, "pending");
        expect(efdProvider.submitCreditNote).toHaveBeenCalledWith({ fiscalReceiptNumber: "FR-1", verificationCode: "VC-1", orderNumber: "NX-5", reason: "Dispute refund" });
        expect(efdRepository.setCreditNoteStatus).toHaveBeenLastCalledWith(77, "issued");
        expect(result.success).toBe(true);
    });

    it("records a failed credit note (for the admin queue) and a provider exception without throwing", async () => {
        efdRepository.findByOrderId.mockResolvedValue(issued);
        efdProvider.submitCreditNote.mockResolvedValue({ success: false, error: "rejected" });
        await service.issueCreditNoteForOrder(5, "x");
        expect(efdRepository.setCreditNoteStatus).toHaveBeenLastCalledWith(77, "failed");

        efdProvider.submitCreditNote.mockRejectedValue(new Error("down"));
        const result = await service.issueCreditNoteForOrder(5, "x");
        expect(result).toEqual({ success: false, error: "down" });
        expect(efdRepository.setCreditNoteStatus).toHaveBeenLastCalledWith(77, "failed");
    });
});

describe("efd.service.getReceiptForOrder (who may see a fiscal receipt)", () => {
    it("allows the buyer, the seller and an admin", async () => {
        efdRepository.findByOrderId.mockResolvedValue({ id: 1 });
        await expect(service.getReceiptForOrder(5, BUYER, false)).resolves.toEqual({ id: 1 });
        await expect(service.getReceiptForOrder(5, SELLER, false)).resolves.toEqual({ id: 1 });
        await expect(service.getReceiptForOrder(5, 999, true)).resolves.toEqual({ id: 1 });
    });

    it("hides it from anyone else, and reports an unknown order the same way", async () => {
        await expect(service.getReceiptForOrder(5, 999, false)).rejects.toThrow("Order not found");
        orderRepository.findOrderById.mockResolvedValue(null);
        await expect(service.getReceiptForOrder(5, BUYER, false)).rejects.toThrow("Order not found");
    });
});

describe("efd provider selection (providers/efd.provider.js)", () => {
    let originalEnv;
    beforeEach(() => { originalEnv = { ...process.env }; });
    afterEach(() => { process.env = originalEnv; jest.dontMock("../../../src/modules/efd/providers/traVfd.provider"); });

    const loadReal = (traConfigured) => {
        jest.resetModules();
        jest.doMock("../../../src/modules/efd/providers/traVfd.provider", () => ({ isConfigured: () => traConfigured, submitInvoice: jest.fn().mockResolvedValue({ via: "tra" }), submitCreditNote: jest.fn() }));
        jest.dontMock("../../../src/modules/efd/providers/efd.provider");
        return jest.requireActual("../../../src/modules/efd/providers/efd.provider");
    };

    it("uses the real TRA provider when it is configured", async () => {
        process.env.NODE_ENV = "production";
        expect(await loadReal(true).submitInvoice({})).toEqual({ via: "tra" });
    });

    it("in production, refuses to fall back to the simulate provider (no fake fiscal receipts)", async () => {
        process.env.NODE_ENV = "production";
        await expect(loadReal(false).submitInvoice({})).rejects.toThrow("TRA VFD is not configured");
        await expect(loadReal(false).submitCreditNote({})).rejects.toThrow("TRA VFD is not configured");
    });

    it("outside production it uses the simulate provider so development works without TRA access", async () => {
        process.env.NODE_ENV = "test";
        const result = await loadReal(false).submitInvoice({ sellerTin: "123456789", orderNumber: "NX-1", items: [], totalAmount: 100 });
        expect(result.success).toBe(true);
    });
});
