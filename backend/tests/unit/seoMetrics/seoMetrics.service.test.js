jest.mock("../../../src/modules/seoMetrics/seoMetrics.repository");

const repository = require("../../../src/modules/seoMetrics/seoMetrics.repository");
const seoMetricsService = require("../../../src/modules/seoMetrics/seoMetrics.service");

describe("seoMetrics.service", () => {
    beforeEach(() => jest.clearAllMocks());

    it("collapses slugs, ids and query strings into route patterns so nothing identifying is stored", () => {
        expect(seoMetricsService.toRoutePattern("/products/red-shoes-123?ref=abc")).toBe("/products/:slug");
        expect(seoMetricsService.toRoutePattern("/stores/my-store/")).toBe("/stores/:slug");
        expect(seoMetricsService.toRoutePattern("/services/category/cleaning")).toBe("/services/category/:slug");
        expect(seoMetricsService.toRoutePattern("/orders/98765/tracking")).toBe("/orders/:id");
        expect(seoMetricsService.toRoutePattern("/seller/products/12/edit")).toBe("/seller");
        expect(seoMetricsService.toRoutePattern("/")).toBe("/");
    });

    it("normalizes search terms so case and spacing variants count as one", () => {
        expect(seoMetricsService.normalizeTerm("  Red   SHOES ")).toBe("red shoes");
    });

    it("ignores one-character search misses and defaults unknown scopes to products", async () => {
        expect(seoMetricsService.recordSearchMiss({ term: "a", scope: "products" })).toBeNull();
        expect(repository.bumpSearchMiss).not.toHaveBeenCalled();

        await seoMetricsService.recordSearchMiss({ term: "Phone", scope: "weird" });
        expect(repository.bumpSearchMiss).toHaveBeenCalledWith({ scope: "products", term: "phone" });
    });

    it("stores a vital against the route pattern, defaulting device to desktop", async () => {
        await seoMetricsService.recordVital({ metric: "LCP", value: "1800.5", rating: "good", path: "/products/abc?x=1" });
        expect(repository.insertVital).toHaveBeenCalledWith({
            metric: "LCP", value: 1800.5, rating: "good", route: "/products/:slug", device: "desktop"
        });
    });
});
