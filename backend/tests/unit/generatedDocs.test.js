// The generated roles matrix must match the routes (re-run `node scripts/generateRolesMatrix.js` if this fails),
// and the anonymous write routes must stay behind a limiter.
const fs = require("fs");
const path = require("path");
const { build } = require("../../scripts/generateRolesMatrix");
const { buildInventory } = require("../../scripts/routeInventory");

describe("generated documentation", () => {
    it("docs/design/roles-matrix.generated.md is up to date with the routes", () => {
        const file = path.join(__dirname, "..", "..", "..", "docs", "design", "roles-matrix.generated.md");
        expect(fs.readFileSync(file, "utf8")).toBe(build());
    });

    it("anonymous beacon writes are rate limited", () => {
        const routes = buildInventory();
        for (const p of ["/api/v1/search/log", "/api/v1/affiliate/click"]) {
            const route = routes.find((r) => r.method === "POST" && r.path === p);
            expect(route).toBeTruthy();
            expect(route.guards).toContain("beaconLimiter");
        }
    });
});
