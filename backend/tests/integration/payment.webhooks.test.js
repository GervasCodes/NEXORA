jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/socket/socket", () => ({ emitToAdmins: jest.fn(), emitToUser: jest.fn(), emitNewMessage: jest.fn() }));
jest.mock("../../src/modules/wallet/wallet.service", () => ({ creditSellersForOrder: jest.fn().mockResolvedValue(undefined) }));
// Fire-and-forget audit logging isn't what these auth/signature tests are
// about, but it does hit db.query (see audit.repository.js) - mocked out
// here so it can't consume a slot in the db.query mock queue below and
// throw off the ordering of the calls these tests actually assert on.
jest.mock("../../src/modules/audit/audit.service", () => ({ log: jest.fn(), logFromRequest: jest.fn() }));

const request = require("supertest");
const db = require("../../src/config/db");
const app = require("../../src/app");

describe("POST /api/v1/payments/webhooks/azampay - shared-secret auth", () => {
    const basePayload = {
        utilityref: "ORDER-1",
        transactionstatus: "success",
        amount: "10000",
        reference: "AZ-TX-1",
        msisdn: "255655128812"
    };

    it("rejects a request with a missing/wrong secret (still 200, per provider-retry-storm handling)", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/azampay")
            .set("Authorization", "Bearer not-the-secret")
            .send(basePayload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        // The forged request must never have reached payment.service - no DB query for it.
        expect(db.query).not.toHaveBeenCalled();
    });

    const mockSuccessfulOrderQueue = () => db.query
        .mockResolvedValueOnce([{ insertId: 1 }]) // webhookReplayGuard.recordDelivery INSERT
        .mockResolvedValueOnce([[{ id: 1, status: "pending", amount: 10000 }]]) // paymentRepository.findByOrderId
        .mockResolvedValueOnce([[{ id: 5, is_parent: 0, buyer_id: 1 }]]) // orderRepository.findOrderById (orderForNotify)
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // claimCompleted
        .mockResolvedValueOnce([{}]) // orderRepository.updatePaymentStatus
        .mockResolvedValueOnce([[{ id: 5, is_parent: 0, buyer_id: 1 }]]); // orderRepository.findOrderById (is_parent check)

    it("processes a webhook with the secret in the Authorization bearer header", async () => {
        mockSuccessfulOrderQueue();

        const res = await request(app)
            .post("/api/v1/payments/webhooks/azampay")
            .set("Authorization", `Bearer ${process.env.AZAMPAY_WEBHOOK_SECRET}`)
            .send({ ...basePayload, utilityref: "ORDER-5" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("processes a webhook with the secret in the callback URL (?secret=)", async () => {
        mockSuccessfulOrderQueue();

        const res = await request(app)
            .post(`/api/v1/payments/webhooks/azampay?secret=${encodeURIComponent(process.env.AZAMPAY_WEBHOOK_SECRET)}`)
            .send({ ...basePayload, utilityref: "ORDER-5" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("fails closed (rejects) in production when AZAMPAY_WEBHOOK_SECRET isn't configured at all", async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalSecret = process.env.AZAMPAY_WEBHOOK_SECRET;
        process.env.NODE_ENV = "production";
        delete process.env.AZAMPAY_WEBHOOK_SECRET;

        const res = await request(app)
            .post("/api/v1/payments/webhooks/azampay")
            .send(basePayload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
        process.env.AZAMPAY_WEBHOOK_SECRET = originalSecret;
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
            .mockResolvedValueOnce([{ affectedRows: 1 }])
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

describe("POST /api/v1/payments/webhooks/pawapay - raw-body callback", () => {
    const deposit = { depositId: "11111111-1111-4111-8111-111111111111", status: "COMPLETED", depositedAmount: "10000" };
    const post = (body, headers = {}) => {
        let r = request(app).post("/api/v1/payments/webhooks/pawapay").set("Content-Type", "application/json");
        Object.entries(headers).forEach(([k, v]) => { r = r.set(k, v); });
        return r.send(JSON.stringify(body));
    };

    afterEach(() => {
        delete process.env.PAWAPAY_ALLOW_UNSIGNED_CALLBACKS;
    });

    it("rejects an unsigned callback by default", async () => {
        delete process.env.PAWAPAY_ALLOW_UNSIGNED_CALLBACKS;

        const res = await post(deposit);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("rejects a callback whose signature cannot be verified", async () => {
        const res = await post(deposit, {
            Signature: "sig-pawapay=:AAAA:",
            "Signature-Input": 'sig-pawapay=("@method" "@authority" "@path" "content-digest");alg="ecdsa-p256-sha256";keyid="x"',
            "Content-Digest": "sha-256=:AAAA:"
        });

        expect(res.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("rejects a body that is not JSON", async () => {
        const res = await request(app)
            .post("/api/v1/payments/webhooks/pawapay")
            .set("Content-Type", "application/json")
            .send("not json");

        expect(res.status).toBe(400);
    });

    it("acknowledges a refund callback that also carries the original depositId, without treating it as a deposit result", async () => {
        process.env.PAWAPAY_ALLOW_UNSIGNED_CALLBACKS = "true";

        const res = await post({ refundId: "33333333-3333-4333-8333-333333333333", depositId: deposit.depositId, status: "COMPLETED" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, ignored: true });
        expect(db.query).not.toHaveBeenCalled();
    });

    it("acknowledges a payout/refund callback (no depositId) without touching the database once the callback is allowed", async () => {
        process.env.PAWAPAY_ALLOW_UNSIGNED_CALLBACKS = "true";

        const res = await post({ payoutId: "22222222-2222-4222-8222-222222222222", status: "COMPLETED" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, ignored: true });
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe("webhook auth - fail closed outside production too", () => {
    const original = { ...process.env };
    afterEach(() => {
        process.env = { ...original };
    });

    const post = () => request(app)
        .post("/api/v1/payments/webhooks/azampay")
        .send({ utilityref: "ORDER-1", transactionstatus: "pending", amount: "1" });

    it("rejects an AzamPay webhook with no secret in a non-production environment when no secret is configured", async () => {
        process.env.NODE_ENV = "test";
        delete process.env.AZAMPAY_WEBHOOK_SECRET;
        delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

        const res = await post();

        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("lets it through only with an explicit ALLOW_UNSIGNED_WEBHOOKS=true (local development)", async () => {
        process.env.NODE_ENV = "test";
        delete process.env.AZAMPAY_WEBHOOK_SECRET;
        process.env.ALLOW_UNSIGNED_WEBHOOKS = "true";
        db.query.mockResolvedValueOnce([{ insertId: 1 }]);

        const res = await post();

        expect(res.body).toMatchObject({ success: true, ignored: true });
    });

    it("ignores ALLOW_UNSIGNED_WEBHOOKS in production", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.AZAMPAY_WEBHOOK_SECRET;
        process.env.ALLOW_UNSIGNED_WEBHOOKS = "true";

        const res = await post();

        expect(res.body.success).toBe(false);
    });

    it("rejects a Selcom webhook from an IP outside SELCOM_WEBHOOK_ALLOWED_IPS even with the right token", async () => {
        process.env.SELCOM_WEBHOOK_ALLOWED_IPS = "203.0.113.9";

        const res = await request(app)
            .post("/api/v1/payments/webhooks/selcom")
            .set("Authorization", `Bearer ${process.env.SELCOM_WEBHOOK_SECRET}`)
            .send({ transid: "ORDER-6", resultcode: "000", result: "SUCCESS" });

        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });
});
