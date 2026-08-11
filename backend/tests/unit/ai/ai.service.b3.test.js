jest.mock("../../../src/modules/ai/providers/registry");
jest.mock("../../../src/modules/ai/ai.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/dispute/dispute.service");
jest.mock("../../../src/modules/dispute/dispute.repository");
jest.mock("../../../src/modules/fraud/fraud.service");
jest.mock("../../../src/modules/admin/admin.service");

const registry = require("../../../src/modules/ai/providers/registry");
const aiRepository = require("../../../src/modules/ai/ai.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const disputeService = require("../../../src/modules/dispute/dispute.service");
const disputeRepository = require("../../../src/modules/dispute/dispute.repository");
const fraudService = require("../../../src/modules/fraud/fraud.service");
const adminService = require("../../../src/modules/admin/admin.service");

const aiService = require("../../../src/modules/ai/ai.service");

const ENABLED_CAPS = {
    enabled: true,
    dailyTokenCapPerUser: 20000,
    monthlyTokenCapPerUser: 300000,
    dailyTokenCapGlobal: 2000000,
    monthlyTokenCapGlobal: 30000000
};

beforeEach(() => {
    settingsService.getAiSettings.mockResolvedValue(ENABLED_CAPS);
    aiRepository.getGlobalTokensSince.mockResolvedValue(0);
    aiRepository.getUserTokensSince.mockResolvedValue(0);
    aiRepository.recordUsage.mockResolvedValue(undefined);
});

describe("ai.service.summarizeDispute", () => {
    const dispute = {
        id: 42,
        dispute_number: "DSP-ABC-1234",
        type: "damaged_item",
        status: "open",
        subject: "Box arrived crushed",
        description: "The package was visibly damaged on arrival.",
        seller_id: 5,
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        evidence: [{ id: 1 }],
        messages: []
    };

    it("reads the real dispute (admin role) and falls back to a plain summary with no provider", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(dispute);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.summarizeDispute({ userId: 1, disputeId: 42 });

        expect(disputeService.getDisputeDetail).toHaveBeenCalledWith(42, 1, "admin");
        expect(result.aiGenerated).toBe(false);
        expect(result.summary).toMatch(/Damaged item/);
        expect(result.summary).toMatch(/1 evidence file/);
    });

    it("re-throws a genuine not-found error instead of swallowing it into an AI response", async () => {
        disputeService.getDisputeDetail.mockRejectedValue(new Error("Dispute not found"));

        await expect(aiService.summarizeDispute({ userId: 1, disputeId: 999 })).rejects.toThrow("Dispute not found");
    });

    it("only gives the provider the real dispute facts already fetched", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(dispute);
        const complete = jest.fn().mockResolvedValue({ text: "Damaged item case, 2 days open, one photo attached, no seller reply yet.", inputTokens: 10, outputTokens: 10 });
        registry.getActiveProvider.mockReturnValue({ complete });

        const result = await aiService.summarizeDispute({ userId: 1, disputeId: 42 });

        expect(complete.mock.calls[0][0].system).toContain("Dispute DSP-ABC-1234");
        expect(complete.mock.calls[0][0].system).toMatch(/do not invent/i);
        expect(result.aiGenerated).toBe(true);
    });
});

describe("ai.service.explainFraudQueue", () => {
    it("reports no open flags without calling the provider", async () => {
        fraudService.listOpenFlags.mockResolvedValue([]);
        registry.getActiveProvider.mockReturnValue({ complete: jest.fn() });

        const result = await aiService.explainFraudQueue({ userId: 1 });

        expect(result).toEqual({ openCount: 0, byRule: [], explanation: "No open fraud flags right now.", aiGenerated: false });
    });

    it("groups real flags by rule and falls back to a plain count summary with no provider", async () => {
        fraudService.listOpenFlags.mockResolvedValue([
            { rule_code: "withdrawal_outlier", severity: "high", reason: "Outlier withdrawal", created_at: "2026-08-01" },
            { rule_code: "order_velocity", severity: "medium", reason: "Fast orders", created_at: "2026-08-05" },
            { rule_code: "order_velocity", severity: "medium", reason: "Fast orders again", created_at: "2026-08-06" }
        ]);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.explainFraudQueue({ userId: 1 });

        expect(result.openCount).toBe(3);
        expect(result.highSeverityCount).toBe(1);
        expect(result.byRule).toEqual(expect.arrayContaining([
            { rule_code: "withdrawal_outlier", count: 1 },
            { rule_code: "order_velocity", count: 2 }
        ]));
        expect(result.aiGenerated).toBe(false);
    });

    it("never asks the provider to produce a fraud verdict, only phrase the queue", async () => {
        fraudService.listOpenFlags.mockResolvedValue([
            { rule_code: "high_value_first_order", severity: "medium", reason: "Big first order", created_at: "2026-08-01" }
        ]);
        const complete = jest.fn().mockResolvedValue({ text: "One open flag - review the first-order-size case.", inputTokens: 5, outputTokens: 5 });
        registry.getActiveProvider.mockReturnValue({ complete });

        await aiService.explainFraudQueue({ userId: 1 });

        expect(complete.mock.calls[0][0].system).toMatch(/do not invent a verdict/i);
    });
});

describe("ai.service.explainForecast", () => {
    const analytics = {
        dailySales: [{ revenue: 1000 }, { revenue: 2000 }],
        forecast: [{ revenue: 1500 }, { revenue: 1500 }, { revenue: 1500 }]
    };
    const servicesAnalytics = {
        dailyBookingSales: [{ revenue: 500 }],
        forecast: [{ revenue: 100 }]
    };

    it("defaults to products, reading the existing forecastRevenue output unchanged", async () => {
        adminService.getAnalytics.mockResolvedValue(analytics);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.explainForecast({ userId: 1, vertical: undefined });

        expect(adminService.getAnalytics).toHaveBeenCalled();
        expect(result.vertical).toBe("products");
        expect(result.recentTotal).toBe(3000);
        expect(result.forecastTotal).toBe(4500);
        expect(result.direction).toBe("up");
        expect(result.aiGenerated).toBe(false);
    });

    it("reads the services forecast when vertical=services", async () => {
        adminService.getServicesAnalytics.mockResolvedValue(servicesAnalytics);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.explainForecast({ userId: 1, vertical: "services" });

        expect(adminService.getServicesAnalytics).toHaveBeenCalled();
        expect(result.vertical).toBe("services");
        expect(result.direction).toBe("down");
    });

    it("only gives the provider the real forecast numbers already computed", async () => {
        adminService.getAnalytics.mockResolvedValue(analytics);
        const complete = jest.fn().mockResolvedValue({ text: "Revenue is trending up.", inputTokens: 5, outputTokens: 5 });
        registry.getActiveProvider.mockReturnValue({ complete });

        await aiService.explainForecast({ userId: 1, vertical: "products" });

        expect(complete.mock.calls[0][0].system).toContain("Trailing 2-day revenue total: 3,000");
        expect(complete.mock.calls[0][0].system).toMatch(/not a guarantee/i);
    });
});

describe("ai.service.explainPersonalizationHealth", () => {
    const metrics = {
        repeatBuyers: {
            totalBuyers: 100,
            repeatBuyers: 40,
            repeatRatePercent: 40,
            last30Days: { activeBuyers: 20, returningBuyers: 12, newBuyers: 8, returningRatePercent: 60 }
        }
    };

    it("reads real business metrics and falls back to a plain-number explanation with no provider", async () => {
        adminService.getBusinessMetrics.mockResolvedValue(metrics);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.explainPersonalizationHealth({ userId: 1 });

        expect(adminService.getBusinessMetrics).toHaveBeenCalled();
        expect(result.repeatRatePercent).toBe(40);
        expect(result.newBuyersLast30Days).toBe(8);
        expect(result.explanation).toMatch(/40%/);
        expect(result.aiGenerated).toBe(false);
    });

    it("never lets the provider redefine the recommendation ranking rule itself", async () => {
        adminService.getBusinessMetrics.mockResolvedValue(metrics);
        const complete = jest.fn().mockResolvedValue({ text: "Most buyers still see trending, not personalized, results.", inputTokens: 5, outputTokens: 5 });
        registry.getActiveProvider.mockReturnValue({ complete });

        const result = await aiService.explainPersonalizationHealth({ userId: 1 });

        expect(complete.mock.calls[0][0].system).toMatch(/rule-based/i);
        expect(result.aiGenerated).toBe(true);
    });
});

describe("ai.service.suggestDisputeResolution", () => {
    const openDispute = {
        id: 42, dispute_number: "DSP-1", type: "damaged_item", status: "open",
        subject: "Box crushed", description: "Damaged on arrival", seller_id: 5,
        evidence: [{ id: 1 }], messages: []
    };

    it("throws for a dispute that isn't open/under_review - nothing to suggest on a closed case", async () => {
        disputeService.getDisputeDetail.mockResolvedValue({ ...openDispute, status: "resolved" });

        await expect(aiService.suggestDisputeResolution({ userId: 1, disputeId: 42 }))
            .rejects.toThrow(/already "resolved"/);
    });

    it("falls back to the most common historical resolution with no provider, never guessing without precedent", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(openDispute);
        disputeRepository.getResolutionStatsForSellerAndType.mockResolvedValue([
            { resolution: "refund_partial", count: 3 },
            { resolution: "no_action", count: 1 }
        ]);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.suggestDisputeResolution({ userId: 1, disputeId: 42 });

        expect(disputeRepository.getResolutionStatsForSellerAndType).toHaveBeenCalledWith(5, "damaged_item", 42);
        expect(result.suggestedResolution).toBe("refund_partial");
        expect(result.aiGenerated).toBe(false);
        expect(result.requiresReview).toBe(true);
    });

    it("suggests nothing (no guess) when there's no historical precedent and no provider", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(openDispute);
        disputeRepository.getResolutionStatsForSellerAndType.mockResolvedValue([]);
        registry.getActiveProvider.mockReturnValue(null);

        const result = await aiService.suggestDisputeResolution({ userId: 1, disputeId: 42 });

        expect(result.suggestedResolution).toBeNull();
        expect(result.suggestedNote).toMatch(/No resolution history/);
        expect(result.requiresReview).toBe(true);
    });

    it("whitelists the AI-suggested resolution against the real 5 resolution values", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(openDispute);
        disputeRepository.getResolutionStatsForSellerAndType.mockResolvedValue([]);
        const complete = jest.fn().mockResolvedValue({
            text: JSON.stringify({ resolution: "delete_seller_account", note: "not a real option" }),
            inputTokens: 5, outputTokens: 5
        });
        registry.getActiveProvider.mockReturnValue({ complete });

        const result = await aiService.suggestDisputeResolution({ userId: 1, disputeId: 42 });

        // Invalid resolution from the model is rejected -> falls back to
        // the rule-based (no-precedent) path, never passed through raw.
        expect(result.aiGenerated).toBe(false);
        expect(result.suggestedResolution).toBeNull();
    });

    it("accepts a valid whitelisted resolution from the provider", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(openDispute);
        disputeRepository.getResolutionStatsForSellerAndType.mockResolvedValue([{ resolution: "refund_full", count: 2 }]);
        const complete = jest.fn().mockResolvedValue({
            text: JSON.stringify({ resolution: "refund_full", note: "Matches this seller's usual precedent." }),
            inputTokens: 5, outputTokens: 5
        });
        registry.getActiveProvider.mockReturnValue({ complete });

        const result = await aiService.suggestDisputeResolution({ userId: 1, disputeId: 42 });

        expect(result.suggestedResolution).toBe("refund_full");
        expect(result.aiGenerated).toBe(true);
        expect(result.requiresReview).toBe(true);
    });

    it("never calls dispute.service.js#resolveDispute itself", async () => {
        disputeService.getDisputeDetail.mockResolvedValue(openDispute);
        disputeRepository.getResolutionStatsForSellerAndType.mockResolvedValue([]);
        registry.getActiveProvider.mockReturnValue(null);

        await aiService.suggestDisputeResolution({ userId: 1, disputeId: 42 });

        expect(disputeService.resolveDispute).not.toHaveBeenCalled();
    });
});
