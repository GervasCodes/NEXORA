const fs = require("fs");
const path = require("path");

// Authorisation is wired once for the whole router (every route is scoped to the
// seller in the service). This guards against a route being added above the gate.
describe("stock.routes", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../../src/modules/stock/stock.routes.js"), "utf8");

    it("applies auth, seller role, business-tools access and the plan gate before any route", () => {
        const gate = source.indexOf("router.use(authMiddleware, authorize(\"seller\"), requireBusinessToolsAccess, requireFeature(\"stock_pos\"))");
        const firstRoute = source.search(/router\.(get|post|put|delete)\(/);
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(firstRoute);
    });

    it("keeps listing on Nexora behind the marketplace-seller checks", () => {
        expect(source).toMatch(/list-on-nexora", marketplaceOnly, requireApprovedSeller/);
        expect(source).toMatch(/unlink", marketplaceOnly/);
    });
});
