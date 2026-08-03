// Integration tests for payment webhook FLOWS beyond auth/signature
// verification, which tests/integration/payment.webhooks.test.js already
// covers thoroughly (one happy-path + one rejection case per provider).
// This file exercises the behavior once a request is past that check:
//
//   - idempotency: a provider retrying a webhook it already delivered
//     successfully must be a no-op, not a double-charge/double-notify
//   - the failed/declined-payment branch (not just the success branch)
//   - the booking-payment webhook path (BOOKING-<id> references), which
//     the original file never exercised (its fixtures are all ORDER-<id>)
//   - true duplicate-delivery rejection at the HTTP layer (the
//     webhookReplayGuard's UNIQUE-constraint path, not just its unit
//     tests in tests/unit/payment/webhookReplayGuard.test.js)
//   - an unrecognized reference shape failing safely (200, not a 5xx
//     that would make a provider retry-storm forever)
//
// Phase 4 (Engineering & Scalability).
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/socket/socket", () => ({ emitToAdmins: jest.fn(), emitToUser: jest.fn(), emitNewMessage: jest.fn() }));
jest.mock("../../src/modules/wallet/wallet.service", () => ({
    creditSellersForOrder: jest.fn().mockResolvedValue(undefined),
    creditProvidersForBooking: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../../src/modules/notification/notification.service", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/modules/audit/audit.service", () => ({ log: jest.fn(), logFromRequest: jest.fn() }));

const crypto = require("crypto");
const request = require("supertest");
const db = require("../../src/config/db");
const app = require("../../src/app");

const nowAsMalipopayTimestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
};

const signMalipopay = ({ reference, timestamp, amount, phoneNumber }) => crypto
    .createHash("sha256")
    .update(`${reference}${timestamp}${amount}${phoneNumber}${process.env.MOBILE_MONEY_API_KEY}`)
    .digest("hex");

const malipopayBasePayload = () => ({
    reference: "ORDER-1",
    timestamp: nowAsMalipopayTimestamp(),
    amount: 10000,
    status: "SUCCESS",
    customer: { firstname: "John", lastname: "Doe", phoneNumber: "255655128812", mno: "Tigo" }
});

const postMalipopay = (payload) => request(app)
    .post("/api/v1/payments/webhooks/malipopay")
    .send({ ...payload, payloadSignature: signMalipopay({ ...payload, phoneNumber: payload.customer.phoneNumber }) });

describe("payment webhooks - idempotency (already-processed order)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("treats a webhook for an already-completed order as a no-op, not an error or a re-charge", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // replayGuard.recordDelivery
            .mockResolvedValueOnce([[{ id: 1, status: "completed" }]]) // findByOrderId - already completed
            .mockResolvedValueOnce([[{ id: 20, is_parent: 0, buyer_id: 1 }]]); // findOrderById (orderForNotify)

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "ORDER-20" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        // No markCompleted/updatePaymentStatus/etc - exactly the 3 reads
        // above and nothing else. A retried webhook for a settled order
        // must never touch payment/order rows again.
        expect(db.query).toHaveBeenCalledTimes(3);
    });

    it("treats a webhook for an already-failed order the same way (no re-processing either direction)", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }])
            .mockResolvedValueOnce([[{ id: 1, status: "failed" }]])
            .mockResolvedValueOnce([[{ id: 21, is_parent: 0, buyer_id: 1 }]]);

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "ORDER-21", status: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.query).toHaveBeenCalledTimes(3);
    });
});

describe("payment webhooks - failed/declined payment branch", () => {
    beforeEach(() => jest.clearAllMocks());

    it("marks the order payment failed (not completed) when the provider reports failure", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // recordDelivery
            .mockResolvedValueOnce([[{ id: 1, status: "pending" }]]) // findByOrderId
            .mockResolvedValueOnce([[{ id: 22, is_parent: 0, buyer_id: 1 }]]) // findOrderById (orderForNotify)
            .mockResolvedValueOnce([{}]); // markFailed

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "ORDER-22", status: "FAILED" });

        expect(res.status).toBe(200);
        // The webhook itself was received/processed fine (still success:
        // true at the HTTP-delivery level) even though the underlying
        // payment failed - a provider retry-storm guard, same as every
        // other webhook response in this suite.
        expect(res.body.success).toBe(true);
        expect(db.query).toHaveBeenCalledTimes(4);
        expect(db.query).toHaveBeenNthCalledWith(
            4,
            "UPDATE payments SET status = 'failed' WHERE id = ?",
            [1]
        );
    });
});

describe("payment webhooks - booking payments (BOOKING-<id> reference)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("marks a booking payment completed on a successful booking webhook", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // recordDelivery
            .mockResolvedValueOnce([[{ id: 5, status: "pending" }]]) // findByBookingId
            .mockResolvedValueOnce([{}]) // markCompleted
            .mockResolvedValueOnce([{}]) // bookingRepository.updatePaymentStatus
            .mockResolvedValueOnce([[{ id: 30, booking_reference: "BK-30", customer_id: 1, provider_id: 2 }]]); // bookingRepository.findById

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "BOOKING-30", status: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.query).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining("status = 'completed'"),
            ["BOOKING-30", expect.any(String), null, null, 5]
        );
    });

    it("marks a booking payment failed on a declined booking webhook, without touching the booking row", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // recordDelivery
            .mockResolvedValueOnce([[{ id: 6, status: "pending" }]]) // findByBookingId
            .mockResolvedValueOnce([{}]); // markFailed

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "BOOKING-31", status: "FAILED" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        // Failure branch never calls bookingRepository.updatePaymentStatus
        // or .findById - just the 3 calls above.
        expect(db.query).toHaveBeenCalledTimes(3);
    });

    it("is idempotent for booking payments too - a retried webhook after completion is a no-op", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // recordDelivery
            .mockResolvedValueOnce([[{ id: 7, status: "completed" }]]); // findByBookingId - already completed

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "BOOKING-32", status: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.query).toHaveBeenCalledTimes(2);
    });
});

describe("payment webhooks - true duplicate delivery (replay-guard UNIQUE-constraint rejection)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("rejects a byte-for-byte replayed Selcom webhook at the auth-middleware layer, before it ever reaches payment.service", async () => {
        const dupError = new Error("Duplicate entry");
        dupError.code = "ER_DUP_ENTRY";
        db.query.mockRejectedValueOnce(dupError); // replayGuard.recordDelivery's INSERT

        const res = await request(app)
            .post("/api/v1/payments/webhooks/selcom")
            .set("Authorization", `Bearer ${process.env.SELCOM_WEBHOOK_SECRET}`)
            .send({ transid: "ORDER-40", reference: "SEL-REF-40", resultcode: "000", result: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        // Only the one recordDelivery INSERT - the request never reached
        // paymentService.handleProviderWebhook (no findByOrderId etc).
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it("rejects a byte-for-byte replayed MalipoPay webhook the same way", async () => {
        const dupError = new Error("Duplicate entry");
        dupError.code = "ER_DUP_ENTRY";
        db.query.mockRejectedValueOnce(dupError);

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "ORDER-41" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});

describe("payment webhooks - unrecognized reference shape", () => {
    beforeEach(() => jest.clearAllMocks());

    it("fails safely (200, not a 5xx) when the reference matches no known prefix, so the provider doesn't retry-storm forever", async () => {
        db.query.mockResolvedValueOnce([{ insertId: 1 }]); // recordDelivery only - the throw happens right after

        const res = await postMalipopay({ ...malipopayBasePayload(), reference: "NOT-A-REAL-REFERENCE-SHAPE" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });
});
