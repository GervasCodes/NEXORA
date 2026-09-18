jest.mock("../../../src/config/dbRead", () => require("../../helpers/mockDb"));
// Same pass-through mock category.service.test.js uses - these tests
// exercise the underlying queries/entry-building, not the caching layer
// itself.
jest.mock("../../../src/utils/cache", () => ({
    getOrSet: jest.fn((namespace, key, fetchFn) => fetchFn()),
    bumpVersion: jest.fn().mockResolvedValue(undefined)
}));

const dbRead = require("../../../src/config/dbRead");
const sitemapService = require("../../../src/modules/sitemap/sitemap.service");

describe("sitemap.service.collectEntries", () => {
    beforeEach(() => {
        dbRead.query.mockReset();
        // collectEntries fires 6 independent queries via Promise.all, in
        // this exact order (see the source) - mockResolvedValueOnce
        // chain matches them up by call order.
        dbRead.query
            .mockResolvedValueOnce([[{ slug: "active-product", updated_at: "2026-09-01T00:00:00.000Z" }]]) // products
            .mockResolvedValueOnce([[{ slug: "active-service", updated_at: "2026-09-02T00:00:00.000Z" }]]) // services
            .mockResolvedValueOnce([[{ store_slug: "active-store", updated_at: "2026-09-03T00:00:00.000Z" }]]) // stores
            .mockResolvedValueOnce([[{ slug: "electronics" }]]) // departments
            .mockResolvedValueOnce([[{ slug: "home-cleaning" }]]) // service categories
            .mockResolvedValueOnce([[{ slug: "how-to-sell", published_at: "2026-08-15T00:00:00.000Z" }]]); // guides
    });

    it("only queries active/published/approved rows for every dynamic source", async () => {
        await sitemapService.collectEntries();

        const queriedSql = dbRead.query.mock.calls.map(([sql]) => sql);

        expect(queriedSql[0]).toContain("is_active = 1");
        expect(queriedSql[0]).toMatch(/FROM products/);

        expect(queriedSql[1]).toContain("is_active = 1");
        expect(queriedSql[1]).toContain("status = 'published'");
        expect(queriedSql[1]).toMatch(/FROM services/);

        expect(queriedSql[2]).toContain("u.is_active = 1");
        expect(queriedSql[2]).toMatch(/FROM seller_profiles/);

        expect(queriedSql[3]).toContain("status = 'active'");
        expect(queriedSql[3]).toContain("slug != 'services'");

        expect(queriedSql[4]).toContain("status = 'active'");
        expect(queriedSql[4]).toMatch(/FROM service_categories/);

        expect(queriedSql[5]).toContain("status = 'published'");
        expect(queriedSql[5]).toMatch(/FROM content_articles/);
    });

    it("builds one URL entry per active product/service/store/department/category/guide, plus the static pages", async () => {
        const entries = await sitemapService.collectEntries();
        const paths = entries.map((entry) => entry.path);

        expect(paths).toEqual(
            expect.arrayContaining([
                "/",
                "/products",
                "/services",
                "/departments/electronics",
                "/services/category/home-cleaning",
                "/products/active-product",
                "/services/active-service",
                "/stores/active-store",
                "/guides/how-to-sell"
            ])
        );

        // No noindex/private routes should ever appear - the whole
        // point of this endpoint is that it only lists what a crawler
        // should actually index.
        expect(paths.some((path) => path.startsWith("/admin"))).toBe(false);
        expect(paths.some((path) => path.startsWith("/seller"))).toBe(false);
        expect(paths.some((path) => path.startsWith("/account"))).toBe(false);
        expect(paths.some((path) => path.startsWith("/checkout"))).toBe(false);
        expect(paths.some((path) => path.startsWith("/compare"))).toBe(false);
    });

    it("carries a lastmod date through for rows that have one", async () => {
        const entries = await sitemapService.collectEntries();
        const product = entries.find((entry) => entry.path === "/products/active-product");

        expect(product.lastmod).toBe("2026-09-01");
    });

    it("excludes an inactive product/unpublished service from the result", async () => {
        dbRead.query.mockReset();
        dbRead.query
            .mockResolvedValueOnce([[]]) // no active products
            .mockResolvedValueOnce([[]]) // no active/published services
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]]);

        const entries = await sitemapService.collectEntries();
        const paths = entries.map((entry) => entry.path);

        expect(paths.some((path) => path.startsWith("/products/"))).toBe(false);
        expect(paths.some((path) => path.startsWith("/services/"))).toBe(false);
        // Static pages are always present regardless of catalog state.
        expect(paths).toContain("/");
    });
});

describe("sitemap.service.buildSitemapXml", () => {
    it("produces a well-formed urlset with escaped, absolute <loc> URLs", () => {
        const xml = sitemapService.buildSitemapXml(
            [{ path: "/products/some-slug", lastmod: "2026-09-01", changefreq: "daily", priority: "0.8" }],
            "https://nexoramarketplace.online"
        );

        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain("<urlset");
        expect(xml).toContain("<loc>https://nexoramarketplace.online/products/some-slug</loc>");
        expect(xml).toContain("<lastmod>2026-09-01</lastmod>");
        expect(xml).toContain("<changefreq>daily</changefreq>");
        expect(xml).toContain("<priority>0.8</priority>");
    });

    it("XML-escapes characters that would otherwise break the document", () => {
        const xml = sitemapService.buildSitemapXml(
            [{ path: "/products/tom-&-jerry" }],
            "https://nexoramarketplace.online"
        );

        expect(xml).toContain("tom-&amp;-jerry");
        expect(xml).not.toContain("tom-&-jerry");
    });
});
