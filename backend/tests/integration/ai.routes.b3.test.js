jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/ai/ai.service");

const jwt = require("jsonwebtoken");
const request = require("supertest");
const db = require("../../src/config/db");
const aiService = require("../../src/modules/ai/ai.service");
const app = require("../../src/app");

const signToken = (payload) => jwt.sign({ id: 1, role: "admin", tv: 0, ...payload }, process.env.JWT_SECRET);

// authMiddleware's own account-status check (see ai.routes.test.js for
// the equivalent buyer-route helper).
const queueAuthMiddlewareCheck = () => {
    db.query.mockResolvedValueOnce([[{
        is_active: 1, deleted_at: null, suspended_at: null, suspension_reason: null,
        token_version: 0, last_active_at: new Date()
    }]]);
};

describe("GET /api/v1/ai/admin/disputes/:id/summary", () => {
    it("requires authentication", async () => {
        const res = await request(app).get("/api/v1/ai/admin/disputes/42/summary");
        expect(res.status).toBe(401);
    });

    it("is not reachable by a non-admin role", async () => {
        queueAuthMiddlewareCheck();

        const res = await request(app)
            .get("/api/v1/ai/admin/disputes/42/summary")
            .set("Authorization", `Bearer ${signToken({ role: "buyer" })}`);

        expect(res.status).toBe(403);
        expect(aiService.summarizeDispute).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric dispute id before reaching the service", async () => {
        queueAuthMiddlewareCheck();

        const res = await request(app)
            .get("/api/v1/ai/admin/disputes/abc/summary")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(400);
        expect(aiService.summarizeDispute).not.toHaveBeenCalled();
    });

    it("returns 400 with the real message, not a generic 500, for a missing dispute", async () => {
        queueAuthMiddlewareCheck();
        aiService.summarizeDispute.mockRejectedValue(new Error("Dispute not found"));

        const res = await request(app)
            .get("/api/v1/ai/admin/disputes/999/summary")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Dispute not found");
    });

    it("returns the summary for an admin", async () => {
        queueAuthMiddlewareCheck();
        aiService.summarizeDispute.mockResolvedValue({
            dispute: { id: 42, status: "open" },
            summary: "Damaged item case, 2 days open.",
            aiGenerated: true
        });

        const res = await request(app)
            .get("/api/v1/ai/admin/disputes/42/summary")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.summary).toBe("Damaged item case, 2 days open.");
        expect(aiService.summarizeDispute).toHaveBeenCalledWith({ userId: 1, disputeId: "42" });
    });
});

describe("POST /api/v1/ai/admin/disputes/:id/suggest-resolution", () => {
    it("never writes anything - it only returns a draft suggestion", async () => {
        queueAuthMiddlewareCheck();
        aiService.suggestDisputeResolution.mockResolvedValue({
            suggestedResolution: "refund_partial",
            suggestedNote: "Matches this seller's usual precedent.",
            historicalPrecedent: [{ resolution: "refund_partial", count: 3 }],
            aiGenerated: true,
            requiresReview: true
        });

        const res = await request(app)
            .post("/api/v1/ai/admin/disputes/42/suggest-resolution")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.requiresReview).toBe(true);
        expect(res.body.data.suggestedResolution).toBe("refund_partial");
    });

    it("returns 400, not 500, when the dispute is already closed", async () => {
        queueAuthMiddlewareCheck();
        aiService.suggestDisputeResolution.mockRejectedValue(new Error('This dispute is already "resolved" - nothing to suggest'));

        const res = await request(app)
            .post("/api/v1/ai/admin/disputes/42/suggest-resolution")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already "resolved"/);
    });
});

describe("GET /api/v1/ai/admin/fraud-flags/explain", () => {
    it("is not reachable by a non-admin role", async () => {
        queueAuthMiddlewareCheck();

        const res = await request(app)
            .get("/api/v1/ai/admin/fraud-flags/explain")
            .set("Authorization", `Bearer ${signToken({ role: "seller" })}`);

        expect(res.status).toBe(403);
    });

    it("returns the queue explanation for an admin", async () => {
        queueAuthMiddlewareCheck();
        aiService.explainFraudQueue.mockResolvedValue({ openCount: 2, highSeverityCount: 1, byRule: [], explanation: "2 open flags.", aiGenerated: true });

        const res = await request(app)
            .get("/api/v1/ai/admin/fraud-flags/explain")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.openCount).toBe(2);
    });
});

describe("GET /api/v1/ai/admin/analytics/forecast-explain", () => {
    it("rejects an invalid vertical before reaching the service", async () => {
        queueAuthMiddlewareCheck();

        const res = await request(app)
            .get("/api/v1/ai/admin/analytics/forecast-explain?vertical=not-a-real-vertical")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(400);
        expect(aiService.explainForecast).not.toHaveBeenCalled();
    });

    it("returns the forecast explanation for a valid vertical", async () => {
        queueAuthMiddlewareCheck();
        aiService.explainForecast.mockResolvedValue({ vertical: "services", recentTotal: 100, forecastTotal: 150, direction: "up", explanation: "Trending up.", aiGenerated: true });

        const res = await request(app)
            .get("/api/v1/ai/admin/analytics/forecast-explain?vertical=services")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.direction).toBe("up");
        expect(aiService.explainForecast).toHaveBeenCalledWith({ userId: 1, vertical: "services" });
    });
});

describe("GET /api/v1/ai/admin/personalization/explain", () => {
    it("returns the personalization health explanation for an admin", async () => {
        queueAuthMiddlewareCheck();
        aiService.explainPersonalizationHealth.mockResolvedValue({
            totalBuyers: 100, repeatBuyers: 40, repeatRatePercent: 40, newBuyersLast30Days: 8,
            explanation: "40% of buyers are repeat customers.", aiGenerated: true
        });

        const res = await request(app)
            .get("/api/v1/ai/admin/personalization/explain")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.repeatRatePercent).toBe(40);
    });

    it("is not reachable by a delivery_agent role", async () => {
        queueAuthMiddlewareCheck();

        const res = await request(app)
            .get("/api/v1/ai/admin/personalization/explain")
            .set("Authorization", `Bearer ${signToken({ role: "delivery_agent" })}`);

        expect(res.status).toBe(403);
    });
});
