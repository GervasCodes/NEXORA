jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/ai/ai.service");

const jwt = require("jsonwebtoken");
const request = require("supertest");
const db = require("../../src/config/db");
const aiService = require("../../src/modules/ai/ai.service");
const app = require("../../src/app");

const signToken = (payload) => jwt.sign({ id: 1, role: "seller", tv: 0, ...payload }, process.env.JWT_SECRET);

// authMiddleware's own account-status check (see ai.routes.test.js for
// the equivalent buyer-route helper).
const queueAuthMiddlewareCheck = () => {
    db.query.mockResolvedValueOnce([[{
        is_active: 1, deleted_at: null, suspended_at: null, suspension_reason: null,
        token_version: 0, last_active_at: new Date()
    }]]);
};

// requireApprovedSeller: authRepository.findById (account_verification_status)
// then sellerRepository.findByUserId (store profile exists).
const queueApprovedSellerChecks = () => {
    db.query.mockResolvedValueOnce([[{ account_verification_status: "approved" }]]);
    db.query.mockResolvedValueOnce([[{ id: 1, user_id: 1 }]]);
};

// requireSubscriptionTier: subscriptionRepository.findCurrentForSeller's
// first (active-in-period) query. A single active, non-free-plan row
// short-circuits the repository before its fallback "most recent plan
// overall" query, so this queues exactly one db.query call - same
// sequential-mock shape the old requireVerificationFeePaid's re-read
// used to need here.
const queueSubscriptionTierCheck = (planCode = "growth") => {
    db.query.mockResolvedValueOnce([[{ id: 1, seller_id: 1, status: "active", plan_code: planCode, current_period_end: null }]]);
};

const queueApprovedDeliveryAgentCheck = () => {
    db.query.mockResolvedValueOnce([[{ account_verification_status: "approved" }]]);
};

describe("POST /api/v1/ai/seller/listing-draft", () => {
    it("requires authentication", async () => {
        const res = await request(app).post("/api/v1/ai/seller/listing-draft").send({ type: "product", name: "Blue Sneakers" });
        expect(res.status).toBe(401);
    });

    it("requires an approved seller account, not just the seller role", async () => {
        queueAuthMiddlewareCheck();
        db.query.mockResolvedValueOnce([[{ account_verification_status: "pending" }]]);

        const res = await request(app)
            .post("/api/v1/ai/seller/listing-draft")
            .set("Authorization", `Bearer ${signToken()}`)
            .send({ type: "product", name: "Blue Sneakers" });

        expect(res.status).toBe(403);
        expect(aiService.generateListingDraft).not.toHaveBeenCalled();
    });

    it("returns the draft for an approved seller", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();
        aiService.generateListingDraft.mockResolvedValue({ description: "A great pair of sneakers.", aiGenerated: true, requiresReview: true });

        const res = await request(app)
            .post("/api/v1/ai/seller/listing-draft")
            .set("Authorization", `Bearer ${signToken()}`)
            .send({ type: "product", name: "Blue Sneakers", category: "Shoes" });

        expect(res.status).toBe(200);
        expect(res.body.data.requiresReview).toBe(true);
        expect(aiService.generateListingDraft).toHaveBeenCalledWith({ userId: 1, type: "product", name: "Blue Sneakers", category: "Shoes", keyFeatures: undefined });
    });

    it("rejects an invalid type before reaching the service", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();

        const res = await request(app)
            .post("/api/v1/ai/seller/listing-draft")
            .set("Authorization", `Bearer ${signToken()}`)
            .send({ type: "not-a-real-type", name: "Blue Sneakers" });

        expect(res.status).toBe(400);
        expect(aiService.generateListingDraft).not.toHaveBeenCalled();
    });
});

describe("POST /api/v1/ai/seller/marketing-copy", () => {
    it("returns the copy for an approved seller", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();
        aiService.generateMarketingCopy.mockResolvedValue({ copy: "Check out our sneakers!", aiGenerated: true, requiresReview: true });

        const res = await request(app)
            .post("/api/v1/ai/seller/marketing-copy")
            .set("Authorization", `Bearer ${signToken()}`)
            .send({ name: "Blue Sneakers" });

        expect(res.status).toBe(200);
        expect(res.body.data.copy).toBe("Check out our sneakers!");
    });
});

describe("GET /api/v1/ai/seller/analytics/summary", () => {
    it("requires a paid subscription tier in addition to seller approval", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();
        // No active plan at all: findCurrentForSeller's active-in-period
        // query comes back empty, then its fallback "most recent plan
        // overall" query also comes back empty (implicit free plan).
        db.query.mockResolvedValueOnce([[]]);
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get("/api/v1/ai/seller/analytics/summary")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("SUBSCRIPTION_REQUIRED");
        expect(aiService.summarizeSellerAnalytics).not.toHaveBeenCalled();
    });

    it("returns the AI summary once every gate passes", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();
        queueSubscriptionTierCheck();
        aiService.summarizeSellerAnalytics.mockResolvedValue({ summary: "Solid month.", aiGenerated: true });

        const res = await request(app)
            .get("/api/v1/ai/seller/analytics/summary")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.summary).toBe("Solid month.");
    });
});

describe("GET /api/v1/ai/seller/services/:serviceId/availability-suggestion", () => {
    it("returns 404, not 500, when the service isn't owned by this seller", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();
        aiService.suggestAvailability.mockRejectedValue(new Error("Service not found"));

        const res = await request(app)
            .get("/api/v1/ai/seller/services/7/availability-suggestion")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Service not found");
    });

    it("rejects a non-numeric service id before reaching the service", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();

        const res = await request(app)
            .get("/api/v1/ai/seller/services/abc/availability-suggestion")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(400);
        expect(aiService.suggestAvailability).not.toHaveBeenCalled();
    });

    it("returns the suggestion for a valid, owned service", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedSellerChecks();
        aiService.suggestAvailability.mockResolvedValue({ closedDates: ["2026-08-12"], busiestWeekday: "Saturday", suggestion: "Open Saturdays.", aiGenerated: true });

        const res = await request(app)
            .get("/api/v1/ai/seller/services/7/availability-suggestion")
            .set("Authorization", `Bearer ${signToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.data.busiestWeekday).toBe("Saturday");
    });
});

describe("GET /api/v1/ai/delivery/route", () => {
    it("requires authentication", async () => {
        const res = await request(app).get("/api/v1/ai/delivery/route");
        expect(res.status).toBe(401);
    });

    it("requires an approved delivery agent account", async () => {
        queueAuthMiddlewareCheck();
        db.query.mockResolvedValueOnce([[{ account_verification_status: "pending" }]]);

        const res = await request(app)
            .get("/api/v1/ai/delivery/route")
            .set("Authorization", `Bearer ${signToken({ role: "delivery_agent" })}`);

        expect(res.status).toBe(403);
        expect(aiService.explainDeliveryRoute).not.toHaveBeenCalled();
    });

    it("returns the route summary for an approved agent", async () => {
        queueAuthMiddlewareCheck();
        queueApprovedDeliveryAgentCheck();
        aiService.explainDeliveryRoute.mockResolvedValue({ deliveries: [], suggestion: "No active deliveries.", aiGenerated: false });

        const res = await request(app)
            .get("/api/v1/ai/delivery/route")
            .set("Authorization", `Bearer ${signToken({ role: "delivery_agent" })}`);

        expect(res.status).toBe(200);
        expect(res.body.data.suggestion).toBe("No active deliveries.");
    });

    it("is not reachable by a buyer role", async () => {
        queueAuthMiddlewareCheck();

        const res = await request(app)
            .get("/api/v1/ai/delivery/route")
            .set("Authorization", `Bearer ${signToken({ role: "buyer" })}`);

        expect(res.status).toBe(403);
    });
});
