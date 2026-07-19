jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/socket/socket", () => ({ emitToAdmins: jest.fn(), emitToUser: jest.fn(), emitNewMessage: jest.fn() }));
jest.mock("../../src/modules/wallet/wallet.service", () => ({ creditSellersForOrder: jest.fn().mockResolvedValue(undefined) }));

const crypto = require("crypto");
const request = require("supertest");
const db = require("../../src/config/db");
const app = require("../../src/app");

describe("POST /api/v1/payments/webhooks/malipopay - shared-secret auth", () => {
    afterEach(() => {
        delete process.env.MALIPOPAY_WEBHOOK_SECRET;
        process.env.MALIPOPAY_WEBHOOK_SECRET = "test-malipopay-secret";
    });

    it("rejects a request with a missing/wrong x-webhook-secret header (still 200, per provider-retry-storm handling)", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/malipopay")
            .send({ reference: "ORDER-1", status: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        // The forged request must never have reached payment.service - no DB query for it.
        expect(db.query).not.toHaveBeenCalled();
    });

    it("processes a webhook with the correct shared secret", async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, status: "pending" }]]) // paymentRepository.findByOrderId
            .mockResolvedValueOnce([{}]) // markCompleted
            .mockResolvedValueOnce([{}]) // orderRepository.updatePaymentStatus
            .mockResolvedValueOnce([[{ id: 5, is_parent: 0 }]]); // orderRepository.findOrderById

        const res = await request(app)
            .post("/api/v1/payments/webhooks/malipopay")
            .set("x-webhook-secret", "test-malipopay-secret")
            .send({ reference: "ORDER-5", status: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("fails closed (rejects) in production when the secret env var isn't configured at all", async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalSecret = process.env.MALIPOPAY_WEBHOOK_SECRET;
        process.env.NODE_ENV = "production";
        delete process.env.MALIPOPAY_WEBHOOK_SECRET;

        const res = await request(app)
            .post("/api/v1/payments/webhooks/malipopay")
            .send({ reference: "ORDER-1", status: "SUCCESS" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        process.env.MALIPOPAY_WEBHOOK_SECRET = originalSecret;
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
            .mockResolvedValueOnce([[{ id: 1, status: "pending" }]]) // findByOrderId
            .mockResolvedValueOnce([{}]) // markCompleted
            .mockResolvedValueOnce([{}]) // updatePaymentStatus
            .mockResolvedValueOnce([[{ id: 9, is_parent: 0 }]]); // findOrderById

        const res = await request(app)
            .post("/api/v1/payments/webhooks/snippe")
            .set("Content-Type", "application/json")
            .set("snippe-signature", sign(Buffer.from(payload)))
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
