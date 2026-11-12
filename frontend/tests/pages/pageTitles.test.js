// Every routed page must set its own browser-tab title (PageMeta/Helmet), directly or through
// the layout/page it renders. A page without one keeps the PREVIOUS page's title (for example
// the product feed showed "Returns - NEXORA"), and AnalyticsTracker reports that stale title as
// the page name. This is a static check over the source, so it needs no rendering.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = join(__dirname, "../../src");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");
const app = read("App.jsx");

// Files imported lazily by App.jsx under ./pages/
const routed = [...app.matchAll(/import\("\.\/(pages\/[^"]+)"\)/g)].map((m) => m[1]);

// Routed files that legitimately have no title of their own, with the reason.
const EXEMPT = {
    "pages/legal/LegalPage": "only redirects to /terms#section (TermsPage sets the title)",
    "pages/seller/SellerProductEntry": "delegates to SellerProductWizard / SellerProductForm, which set titles",
    "pages/NotFound": "checked separately below"
};
// Every page under this folder renders inside StockLayout, which sets the title (asserted below).
const COVERED_BY_STOCK_LAYOUT = "pages/seller/stock/";

const file = (rel) => ["", ".jsx", ".js"].map((ext) => rel + ext).find((candidate) => existsSync(join(SRC, candidate)));

describe("page titles", () => {
    it("finds the routed pages", () => {
        expect(routed.length).toBeGreaterThan(80);
    });

    it("every routed page sets a title (or is a documented exception)", () => {
        const missing = routed.filter((rel) => {
            if (EXEMPT[rel] || rel.startsWith(COVERED_BY_STOCK_LAYOUT)) return false;
            const path = file(rel);
            if (!path) return false; // not a plain file path (e.g. directory import)
            return !/PageMeta|Helmet/.test(read(path));
        });
        expect(missing).toEqual([]);
    });

    it("the stock sub-pages get their title from StockLayout", () => {
        expect(read("pages/seller/stock/StockLayout.jsx")).toMatch(/<PageMeta[^>]*stock\.title/);
    });

    it("ProductFeed (/feed) has its own title and is kept out of the index", () => {
        const feed = read("pages/ProductFeed.jsx");
        expect(feed).toMatch(/<PageMeta[^>]*search\.browseAll/);
        expect(feed).toMatch(/noIndexFollow/);
    });
});
