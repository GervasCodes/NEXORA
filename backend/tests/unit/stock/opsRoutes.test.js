const fs = require("fs");
const path = require("path");
const src = (f) => fs.readFileSync(path.join(__dirname, "../../../src/modules/stock", f), "utf8");

describe("ops.routes (Phase 8)", () => {
    const routes = src("ops.routes.js");

    it("is mounted in stock.routes.js after the plan gate", () => {
        const main = src("stock.routes.js");
        expect(main.indexOf('requireFeature("stock_pos"))')).toBeGreaterThan(-1);
        expect(main.indexOf('router.use(require("./ops.routes"))')).toBeGreaterThan(main.indexOf('requireFeature("stock_pos"))'));
    });

    it("gates every report route on stock_reports, and valuation also on stock_cost_reports", () => {
        const lines = routes.split("\n").filter((l) => l.startsWith("router.get(\"/reports/"));
        expect(lines).toHaveLength(6);
        lines.forEach((l) => expect(l).toMatch(/reportsGate/));
        expect(lines.find((l) => l.includes("valuation"))).toMatch(/requireFeature\("stock_cost_reports"\)/);
    });

    it("gates import and export on stock_import_export; the only write is the import", () => {
        expect(routes).toMatch(/const ioGate = requireFeature\("stock_import_export"\)/);
        ["/import/template", "/import/items", "/export/:kind"].forEach((p) => {
            expect(routes.split("\n").find((l) => l.includes(`"${p}"`))).toMatch(/ioGate/);
        });
    });

    it("exports are GET (so they stay available in read-only mode) and imports are POST (so they don't)", () => {
        expect(routes).toMatch(/router\.get\("\/export\/:kind"/);
        expect(routes).toMatch(/router\.post\("\/import\/items"/);
    });

    it("every write route validates input and the receipt upload is image-only", () => {
        const posts = routes.split("\n").filter((l) => l.startsWith("router.post("));
        expect(posts.length).toBeGreaterThanOrEqual(4);
        posts.filter((l) => !l.includes("/import/items")).forEach((l) => expect(l).toMatch(/validationMiddleware/));
        expect(routes).toMatch(/upload\.single\("receipt"\)/);
        expect(require("fs").readFileSync(path.join(__dirname, "../../../src/middleware/upload.middleware.js"), "utf8")).toMatch(/validateFileContent\(\["image"\]\)/);
        expect(require("fs").readFileSync(path.join(__dirname, "../../../src/middleware/spreadsheetUpload.middleware.js"), "utf8")).toMatch(/validateFileContent\(\["document"\]/);
    });

    it("no service in this phase takes a seller id from the request body", () => {
        const ctrl = src("ops.controller.js");
        expect(ctrl).not.toMatch(/req\.body\.(seller|user)_?[iI]d/);
        expect((ctrl.match(/req\.user\.id/g) || []).length).toBeGreaterThanOrEqual(12);
    });
});
