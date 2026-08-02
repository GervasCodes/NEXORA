jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/socket/socket", () => ({ emitToAdmins: jest.fn(), emitToUser: jest.fn(), emitNewMessage: jest.fn() }));
jest.mock("../../src/modules/wallet/wallet.service", () => ({ creditSellersForOrder: jest.fn().mockResolvedValue(undefined) }));
// Fire-and-forget audit logging isn't what these auth/signature tests are
// about, but it does hit db.query (see audit.repository.js) - mocked out
// here so it can't consume a slot in the db.query mock queue below and
// throw off the ordering of the calls these tests actually assert on.
jest.mock("../../src/modules/audit/audit.service", () => ({ log: jest.fn(), logFromRequest: jest.fn() }));

const crypto = require("crypto");
const request = require("supertest");
const db = require("../../src/config/db");
const app = require("../../src/app");

describe("POST /api/v1/payments/webhooks/malipopay - payloadSignature verification", () => {
    // Matches developers.malipopay.co.tz/integration/webhooks:
    // SHA256(reference + timestamp + amount + phoneNumber + secret)
    const sign = ({ reference, timestamp, amount, phoneNumber }) => crypto
        .createHash("sha256")
        .update(`${reference}${timestamp}${amount}${phoneNumber}${process.env.MOBILE_MONEY_API_KEY}`)
        .digest("hex");

    // Phase 2 (Security Hardening) added a replay-protection timestamp
    // freshness check (see utils/webhookReplayGuard.js) - MalipoPay's
    // documented "yyyyMMddHHmmss" timestamp must be within a few minutes
    // of "now" or the webhook is rejected as a possible replay. Generate
    // it fresh at test-run time rather than hardcoding a calendar date,
    // which would otherwise start failing the moment it falls outside
    // that window.
    const nowAsMalipopayTimestamp = () => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
    };

    const basePayload = {
        reference: "ORDER-1",
        timestamp: nowAsMalipopayTimestamp(),
        amount: 10000,
        status: "SUCCESS",
        customer: { firstname: "John", lastname: "Doe", phoneNumber: "255655128812", mno: "Tigo" }
    };

    it("rejects a request with a missing/wrong payloadSignature (still 200, per provider-retry-storm handling)", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/malipopay")
            .send({ ...basePayload, payloadSignature: "0".repeat(64) });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        // The forged request must never have reached payment.service - no DB query for it.
        expect(db.query).not.toHaveBeenCalled();
    });

    it("processes a webhook with a correctly computed payloadSignature", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // webhookReplayGuard.recordDelivery INSERT
            .mockResolvedValueOnce([[{ id: 1, status: "pending" }]]) // paymentRepository.findByOrderId
            .mockResolvedValueOnce([[{ id: 5, is_parent: 0, buyer_id: 1 }]]) // orderRepository.findOrderById (orderForNotify, fetched up front)
            .mockResolvedValueOnce([{}]) // markCompleted
            .mockResolvedValueOnce([{}]) // orderRepository.updatePaymentStatus
            .mockResolvedValueOnce([[{ id: 5, is_parent: 0, buyer_id: 1 }]]); // orderRepository.findOrderById (is_parent check)

        const payload = { ...basePayload, reference: "ORDER-5" };
        const res = await request(app)
            .post("/api/v1/payments/webhooks/malipopay")
            .send({ ...payload, payloadSignature: sign({ ...payload, phoneNumber: payload.customer.phoneNumber }) });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("fails closed (rejects) in production when MOBILE_MONEY_API_KEY isn't configured at all", async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalKey = process.env.MOBILE_MONEY_API_KEY;
        process.env.NODE_ENV = "production";
        delete process.env.MOBILE_MONEY_API_KEY;

        const res = await request(app)
            .post("/api/v1/payments/webhooks/malipopay")
            .send({ ...basePayload, payloadSignature: "0".repeat(64) });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        process.env.MOBILE_MONEY_API_KEY = originalKey;
    });
});

describe("POST /api/v1/payments/webhooks/selcom - Bearer token auth", () => {
    it("rejects a request with a missing/wrong Authorization bearer token (still 200, per provider-retry-storm handling)", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/selcom")
            .send({ transid: "T1", reference: "ORDER-1", resultcode: "000", result: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("processes a webhook with the correct bearer token", async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // webhookReplayGuard.recordDelivery INSERT
            .mockResolvedValueOnce([[{ id: 1, status: "pending" }]])
            .mockResolvedValueOnce([[{ id: 6, is_parent: 0, buyer_id: 1 }]])
            .mockResolvedValueOnce([{}])
            .mockResolvedValueOnce([{}])
            .mockResolvedValueOnce([[{ id: 6, is_parent: 0, buyer_id: 1 }]]);

        const res = await request(app)
            .post("/api/v1/payments/webhooks/selcom")
            .set("Authorization", `Bearer ${process.env.SELCOM_WEBHOOK_SECRET}`)
            .send({ transid: "ORDER-6", reference: "SEL-REF-6", resultcode: "000", result: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("fails closed (rejects) in production when SELCOM_WEBHOOK_SECRET isn't configured at all", async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalSecret = process.env.SELCOM_WEBHOOK_SECRET;
        process.env.NODE_ENV = "production";
        delete process.env.SELCOM_WEBHOOK_SECRET;

        const res = await request(app)
            .post("/api/v1/payments/webhooks/selcom")
            .send({ transid: "T1", reference: "ORDER-1", resultcode: "000", result: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        process.env.SELCOM_WEBHOOK_SECRET = originalSecret;
    });
});

describe("POST /api/v1/payments/webhooks/snippe - raw-body HMAC signature", () => {
    const sign = (body) => crypto
        .createHmac("sha256", process.env.SNIPPE_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");

    it("rejects a request with no signature header", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/snippe")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ type: "checkout.session.completed" }));

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it("rejects a request with an invalid signature", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/snippe")
            .set("Content-Type", "application/json")
            .set("snippe-signature", "0".repeat(64))
            .send(JSON.stringify({ type: "checkout.session.completed" }));

        expect(res.status).toBe(400);
    });

    it("accepts and processes a validly-signed checkout.session.completed event", async () => {
        const payload = JSON.stringify({
            type: "checkout.session.completed",
            data: { reference: "ORDER-9", payment_status: "paid", payment_id: "sess_abc" }
        });

        db.query
            .mockResolvedValueOnce([{ insertId: 1 }]) // webhookReplayGuard.recordDelivery INSERT
            .mockResolvedValueOnce([[{ id: 1, status: "pending" }]]) // findByOrderId
            .mockResolvedValueOnce([[{ id: 9, is_parent: 0, buyer_id: 1 }]]) // findOrderById (orderForNotify, fetched up front)
            .mockResolvedValueOnce([{}]) // markCompleted
            .mockResolvedValueOnce([{}]) // updatePaymentStatus
            .mockResolvedValueOnce([[{ id: 9, is_parent: 0, buyer_id: 1 }]]); // findOrderById (is_parent check)

        const res = await request(app)
            .post("/api/v1/payments/webhooks/snippe")
            .set("Content-Type", "application/json")
            .set("snippe-signature", sign(Buffer.from(payload)))
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
