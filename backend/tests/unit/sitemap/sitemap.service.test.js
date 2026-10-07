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
        // collectEntries fires 8 independent queries via Promise.all, in
        // this exact order (see the source) - mockResolvedValueOnce
        // chain matches them up by call order.
        dbRead.query
            .mockResolvedValueOnce([[{ id: 1, slug: "active-product", updated_at: "2026-09-01T00:00:00.000Z" }]]) // products
            .mockResolvedValueOnce([[{ id: 2, slug: "active-service", updated_at: "2026-09-02T00:00:00.000Z" }]]) // services
            .mockResolvedValueOnce([[{ store_slug: "active-store", updated_at: "2026-09-03T00:00:00.000Z" }]]) // stores
            .mockResolvedValueOnce([[{ slug: "electronics", updated_at: "2026-09-04T00:00:00.000Z" }]]) // departments
            .mockResolvedValueOnce([[{ slug: "home-cleaning", updated_at: "2026-09-05T00:00:00.000Z" }]]) // service categories
            .mockResolvedValueOnce([[{ slug: "how-to-sell", published_at: "2026-08-15T00:00:00.000Z", updated_at: "2026-08-20T00:00:00.000Z" }]]) // guides
            .mockResolvedValueOnce([[
                { product_id: 1, image_url: "https://res.cloudinary.com/x/a.jpg" },
                { product_id: 1, image_url: "/relative-should-be-dropped.jpg" }
            ]]) // product images
            .mockResolvedValueOnce([[{ service_id: 2, image_url: "https://res.cloudinary.com/x/s.jpg" }]]); // service images
    });

    it("only queries active/published/approved rows for every dynamic source", async () => {
        await sitemapService.collectEntries();

        const queriedSql = dbRead.query.mock.calls.map(([sql]) => sql);

        expect(queriedSql[0]).toContain("is_active = 1");
        expect(queriedSql[0]).toMatch(/FROM products/);
        // Products/services/stores of inactive or not-yet-approved sellers
        // must never reach the sitemap.
        expect(queriedSql[0]).toContain("u.account_verification_status = 'approved'");

        expect(queriedSql[1]).toContain("is_active = 1");
        expect(queriedSql[1]).toContain("status = 'published'");
        expect(queriedSql[1]).toMatch(/FROM services/);
        expect(queriedSql[1]).toContain("u.account_verification_status = 'approved'");

        expect(queriedSql[2]).toContain("u.is_active = 1");
        expect(queriedSql[2]).toContain("u.account_verification_status = 'approved'");
        expect(queriedSql[2]).toMatch(/FROM seller_profiles/);
        // Empty stores (no live product and no published service) are left out.
        expect(queriedSql[2]).toContain("EXISTS (SELECT 1 FROM products");
        expect(queriedSql[2]).toContain("EXISTS (SELECT 1 FROM services");

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
        const guide = entries.find((entry) => entry.path === "/guides/how-to-sell");

        expect(product.lastmod).toBe("2026-09-01");
        // A guide's lastmod is its last edit, not its first publish date.
        expect(guide.lastmod).toBe("2026-08-20");
    });

    it("lists the new marketing pages and never emits changefreq/priority", async () => {
        const entries = await sitemapService.collectEntries();
        const paths = entries.map((entry) => entry.path);

        expect(paths).toEqual(expect.arrayContaining(["/sell", "/how-it-works", "/about", "/contact", "/legal/refund-policy", "/legal/cookie-policy"]));
        expect(entries.some((entry) => "changefreq" in entry || "priority" in entry)).toBe(false);
    });

    it("attaches only absolute image URLs to product and service entries", async () => {
        const entries = await sitemapService.collectEntries();

        expect(entries.find((e) => e.path === "/products/active-product").images).toEqual(["https://res.cloudinary.com/x/a.jpg"]);
        expect(entries.find((e) => e.path === "/services/active-service").images).toEqual(["https://res.cloudinary.com/x/s.jpg"]);
    });

    it("excludes an inactive product/unpublished service from the result", async () => {
        dbRead.query.mockReset();
        dbRead.query
            .mockResolvedValueOnce([[]]) // no active products
            .mockResolvedValueOnce([[]]) // no active/published services
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
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
            [{ path: "/products/some-slug", lastmod: "2026-09-01", images: ["https://res.cloudinary.com/x/a&b.jpg"] }],
            "https://nexoramarketplace.online"
        );

        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain("<urlset");
        expect(xml).toContain("<loc>https://nexoramarketplace.online/products/some-slug</loc>");
        expect(xml).toContain("<lastmod>2026-09-01</lastmod>");
        expect(xml).not.toContain("<changefreq>");
        expect(xml).not.toContain("<priority>");
        expect(xml).toContain("xmlns:image=");
        expect(xml).toContain("<image:loc>https://res.cloudinary.com/x/a&amp;b.jpg</image:loc>");
    });

    it("splits into a sitemap index once a file would be too large", () => {
        const entries = Array.from({ length: 5 }, (_, i) => ({ path: `/products/p-${i}` }));
        const parts = sitemapService.splitEntries(entries, 2);
        const index = sitemapService.buildSitemapIndexXml(parts.length, "https://nexoramarketplace.online", "2026-09-01");

        expect(parts.map((p) => p.length)).toEqual([2, 2, 1]);
        expect(index).toContain("<sitemapindex");
        expect(index).toContain("<loc>https://nexoramarketplace.online/sitemap-3.xml</loc>");
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
