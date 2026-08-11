jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/ai/ai.service");

const jwt = require("jsonwebtoken");
const request = require("supertest");
const db = require("../../src/config/db");
const aiService = require("../../src/modules/ai/ai.service");
const app = require("../../src/app");

const signToken = (payload) => jwt.sign({ id: 1, role: "buyer", tv: 0, ...payload }, process.env.JWT_SECRET);

// authMiddleware re-checks account status against the DB on every
// request (see auth.middleware.js) - only the order-explain route goes
// through it, so only tests that hit that route need this queued up.
const mockActiveBuyer = () => {
    db.query.mockResolvedValueOnce([[{
        is_active: 1,
        deleted_at: null,
        suspended_at: null,
        suspension_reason: null,
        token_version: 0,
        last_active_at: new Date()
    }]]);
};

describe("POST /api/v1/ai/chat", () => {
    it("is public - works with no Authorization header at all", async () => {
        aiService.chat.mockResolvedValue({ reply: "Track it from Orders.", aiGenerated: false });

        const res = await request(app).post("/api/v1/ai/chat").send({ message: "where is my order" });

        expect(res.status).toBe(200);
        expect(res.body.data.reply).toBe("Track it from Orders.");
        expect(aiService.chat).toHaveBeenCalledWith({ userId: null, message: "where is my order" });
    });

    it("personalizes with the decoded buyer id when a valid token is sent, without hitting the DB", async () => {
        aiService.chat.mockResolvedValue({ reply: "hi", aiGenerated: false });

        const res = await request(app)
            .post("/api/v1/ai/chat")
            .set("Authorization", `Bearer ${signToken({ id: 7 })}`)
            .send({ message: "hello" });

        expect(res.status).toBe(200);
        expect(aiService.chat).toHaveBeenCalledWith({ userId: 7, message: "hello" });
        expect(db.query).not.toHaveBeenCalled();
    });

    it("rejects an empty message with a validation error before ever calling the service", async () => {
        const res = await request(app).post("/api/v1/ai/chat").send({ message: "" });

        expect(res.status).toBe(400);
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it("rejects a message over the length cap", async () => {
        const res = await request(app).post("/api/v1/ai/chat").send({ message: "a".repeat(1001) });

        expect(res.status).toBe(400);
        expect(aiService.chat).not.toHaveBeenCalled();
    });
});

describe("POST /api/v1/ai/search/parse", () => {
    it("returns the parsed filters", async () => {
        aiService.parseSearchQuery.mockResolvedValue({ search: "shoes", min_price: null, max_price: null, sort: null, aiGenerated: false });

        const res = await request(app).post("/api/v1/ai/search/parse").send({ text: "cheap shoes" });

        expect(res.status).toBe(200);
        expect(res.body.data.search).toBe("shoes");
    });

    it("rejects missing text", async () => {
        const res = await request(app).post("/api/v1/ai/search/parse").send({});
        expect(res.status).toBe(400);
    });
});

describe("GET /api/v1/ai/recommendations/:context/explain", () => {
    it("treats 'for-me' as the personal feed (no product slug)", async () => {
        aiService.explainRecommendations.mockResolvedValue({ products: [], aiGenerated: false });

        const res = await request(app).get("/api/v1/ai/recommendations/for-me/explain");

        expect(res.status).toBe(200);
        expect(aiService.explainRecommendations).toHaveBeenCalledWith({ userId: null, forProductSlug: null });
    });

    it("treats anything else as a product slug", async () => {
        aiService.explainRecommendations.mockResolvedValue({ products: [], aiGenerated: false });

        await request(app).get("/api/v1/ai/recommendations/blue-sneakers/explain");

        expect(aiService.explainRecommendations).toHaveBeenCalledWith({ userId: null, forProductSlug: "blue-sneakers" });
    });
});

describe("POST /api/v1/ai/orders/:id/explain", () => {
    it("requires authentication", async () => {
        const res = await request(app).post("/api/v1/ai/orders/1/explain");
        expect(res.status).toBe(401);
        expect(aiService.explainOrderStatus).not.toHaveBeenCalled();
    });

    it("calls the service with the authenticated buyer's id once authenticated", async () => {
        mockActiveBuyer();
        aiService.explainOrderStatus.mockResolvedValue({
            order: { id: 42, status: "shipped", payment_status: "paid" },
            explanation: "On its way.",
            aiGenerated: false
        });

        const res = await request(app)
            .post("/api/v1/ai/orders/42/explain")
            .set("Authorization", `Bearer ${signToken({ id: 9 })}`);

        expect(res.status).toBe(200);
        expect(aiService.explainOrderStatus).toHaveBeenCalledWith({ userId: 9, orderId: "42" });
    });

    it("returns 404, not 500, when the order isn't found/owned", async () => {
        mockActiveBuyer();
        aiService.explainOrderStatus.mockRejectedValue(new Error("Order not found"));

        const res = await request(app)
            .post("/api/v1/ai/orders/999/explain")
            .set("Authorization", `Bearer ${signToken({ id: 9 })}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Order not found");
    });

    it("rejects a non-numeric order id before reaching the service", async () => {
        mockActiveBuyer();

        const res = await request(app)
            .post("/api/v1/ai/orders/not-a-number/explain")
            .set("Authorization", `Bearer ${signToken({ id: 9 })}`);

        expect(res.status).toBe(400);
        expect(aiService.explainOrderStatus).not.toHaveBeenCalled();
    });
});
