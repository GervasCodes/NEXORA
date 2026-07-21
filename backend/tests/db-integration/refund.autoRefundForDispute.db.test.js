// Real-database integration tests for refund.service.autoRefundForDispute()
// (Phase 2's refund automation, now exercised against real MySQL for
// Phase 3). Only the actual payment-provider network calls and
// audit.service are mocked - refunds/payments/disputes/orders all run
// against real SQL, which is what this suite exists to catch (a typo'd
// column, a broken join, or - specifically here - the UNIQUE(dispute_id)
// constraint that guarantees "one automatic refund per dispute" actually
// firing as expected).
jest.mock("../../src/modules/payment/providers/mobileMoney.provider");
jest.mock("../../src/modules/payment/providers/snippe.provider");
jest.mock("../../src/modules/audit/audit.service");

const mobileMoneyProvider = require("../../src/modules/payment/providers/mobileMoney.provider");
const snippeProvider = require("../../src/modules/payment/providers/snippe.provider");

const db = require("../../src/config/db");
const refundService = require("../../src/modules/refund/refund.service");
const fixtures = require("./helpers/dbFixtures");

beforeEach(async () => {
    await fixtures.resetTables();
    jest.clearAllMocks();
});

afterAll(async () => {
    await fixtures.closePool();
});

const setUpDisputeWithPayment = async ({ paymentOverrides = {}, disputeOverrides = {} } = {}) => {
    const buyer = await fixtures.createUser({ role: "buyer" });
    const seller = await fixtures.createUser({ role: "seller" });
    const order = await fixtures.createOrder(buyer.id, { total_amount: 1000, shipping_phone: "+255700000000" });
    const payment = await fixtures.createPayment(order.id, { method: "mobile_money", amount: 1000, ...paymentOverrides });
    const dispute = await fixtures.createDispute(order.id, buyer.id, seller.id, {
        resolution: "refund_full",
        refund_amount: 1000,
        ...disputeOverrides
    });

    return { buyer, seller, order, payment, dispute };
};

describe("refund.service.autoRefundForDispute (real database)", () => {
    it("on a successful mobile-money refund: writes a completed refunds row referencing the real dispute/payment/order", async () => {
        mobileMoneyProvider.refund.mockResolvedValue({ success: true, transactionReference: "MM-REF-123" });

        const { dispute, payment, order, buyer, seller } = await setUpDisputeWithPayment();

        const result = await refundService.autoRefundForDispute({
            dispute: { id: dispute.id, order_id: order.id, buyer_id: buyer.id, seller_id: seller.id },
            amount: 1000,
            requestedBy: null
        });

        expect(result).toEqual(expect.objectContaining({ status: "completed" }));

        const [[row]] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [dispute.id]);
        expect(row).toEqual(
            expect.objectContaining({
                payment_id: payment.id,
                order_id: order.id,
                buyer_id: buyer.id,
                provider: "mobile_money",
                status: "completed",
                provider_reference: "MM-REF-123"
            })
        );
        expect(Number(row.amount)).toBe(1000);
        expect(row.completed_at).not.toBeNull();
        expect(mobileMoneyProvider.refund).toHaveBeenCalledTimes(1);
    });

    it("on a provider decline that persists across all retries: leaves the real row 'failed' with attempts=3 and the last error recorded", async () => {
        mobileMoneyProvider.refund.mockResolvedValue({ success: false });

        const { dispute, order, buyer, seller } = await setUpDisputeWithPayment();

        const result = await refundService.autoRefundForDispute({
            dispute: { id: dispute.id, order_id: order.id, buyer_id: buyer.id, seller_id: seller.id },
            amount: 1000,
            requestedBy: null
        });

        expect(result.status).toBe("failed");

        const [[row]] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [dispute.id]);
        expect(row.status).toBe("failed");
        expect(row.attempts).toBe(3);
        expect(row.last_error).toMatch(/declined/i);
        expect(mobileMoneyProvider.refund).toHaveBeenCalledTimes(3);
    }, 20000); // real retry backoff (1s + 3s) plus real DB round trips

    it("idempotency: calling it twice for the same dispute only ever creates one refunds row (UNIQUE(dispute_id) enforced by real MySQL)", async () => {
        mobileMoneyProvider.refund.mockResolvedValue({ success: true, transactionReference: "MM-REF-1" });

        const { dispute, order, buyer, seller } = await setUpDisputeWithPayment();
        const disputeArg = { id: dispute.id, order_id: order.id, buyer_id: buyer.id, seller_id: seller.id };

        const first = await refundService.autoRefundForDispute({ dispute: disputeArg, amount: 1000, requestedBy: null });
        const second = await refundService.autoRefundForDispute({ dispute: disputeArg, amount: 1000, requestedBy: null });

        expect(second.refundId).toBe(first.refundId);

        const [rows] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [dispute.id]);
        expect(rows).toHaveLength(1);
        // Second call short-circuits on the existing row - provider is
        // only ever actually called once, from the first attempt.
        expect(mobileMoneyProvider.refund).toHaveBeenCalledTimes(1);
    });

    it("snippe payments: dispatches to the snippe provider, not mobile money, and records its reference", async () => {
        snippeProvider.refundPayment.mockResolvedValue({ success: true, refundReference: "SNIPPE-REF-9" });

        const { dispute, order, buyer, seller } = await setUpDisputeWithPayment({
            paymentOverrides: { method: "snippe", transaction_reference: "SNIPPE-TX-9" }
        });

        await refundService.autoRefundForDispute({
            dispute: { id: dispute.id, order_id: order.id, buyer_id: buyer.id, seller_id: seller.id },
            amount: 1000,
            requestedBy: null
        });

        const [[row]] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [dispute.id]);
        expect(row.provider).toBe("snippe");
        expect(row.provider_reference).toBe("SNIPPE-REF-9");
        expect(mobileMoneyProvider.refund).not.toHaveBeenCalled();
    });

    it("cash_on_delivery: writes a real 'manual_required' row instead of calling any provider", async () => {
        const { dispute, order, buyer, seller } = await setUpDisputeWithPayment({
            paymentOverrides: { method: "cash_on_delivery" }
        });

        const result = await refundService.autoRefundForDispute({
            dispute: { id: dispute.id, order_id: order.id, buyer_id: buyer.id, seller_id: seller.id },
            amount: 1000,
            requestedBy: null
        });

        expect(result.status).toBe("manual_required");

        const [[row]] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [dispute.id]);
        expect(row.status).toBe("manual_required");
        expect(mobileMoneyProvider.refund).not.toHaveBeenCalled();
        expect(snippeProvider.refundPayment).not.toHaveBeenCalled();
    });

    it("no completed payment on the order: returns manual_required and writes no refunds row at all", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const order = await fixtures.createOrder(buyer.id, { total_amount: 1000 });
        // Payment left as 'pending' (never completed) - see createPayment's default override below.
        await fixtures.createPayment(order.id, { status: "pending" });
        const dispute = await fixtures.createDispute(order.id, buyer.id, seller.id);

        const result = await refundService.autoRefundForDispute({
            dispute: { id: dispute.id, order_id: order.id, buyer_id: buyer.id, seller_id: seller.id },
            amount: 1000,
            requestedBy: null
        });

        expect(result.status).toBe("manual_required");

        const [rows] = await db.query("SELECT * FROM refunds WHERE dispute_id = ?", [dispute.id]);
        expect(rows).toHaveLength(0);
    });
});
