const fs = require("fs");
const path = require("path");
const src = (p) => fs.readFileSync(path.join(__dirname, "../../../src/modules/stock", p), "utf8");

// The sales/purchases routes must sit behind the same gate as the rest of Nexora
// Stock Management (auth, seller role, business-tools access, plan).
describe("trade routes wiring", () => {
    it("is mounted after the gate in stock.routes.js", () => {
        const routes = src("stock.routes.js");
        const gate = routes.indexOf("router.use(authMiddleware, authorize(\"seller\"), requireBusinessToolsAccess, requireFeature(\"stock_pos\"))");
        const mount = routes.indexOf("router.use(require(\"./trade.routes\"))");
        expect(gate).toBeGreaterThan(-1);
        expect(mount).toBeGreaterThan(gate);
    });

    it("never attaches its own router to the app without the gate", () => {
        expect(src("trade.routes.js")).not.toMatch(/authMiddleware|app\.use/);
        const app = fs.readFileSync(path.join(__dirname, "../../../src/app.js"), "utf8");
        expect(app).not.toMatch(/trade\.routes/);
    });

    it("every route has a validator (or only an id) and the controller scopes by req.user.id", () => {
        const routes = src("trade.routes.js");
        const defs = routes.match(/router\.(get|post|put)\([^;]+;/g);
        expect(defs.length).toBeGreaterThanOrEqual(21);
        defs.forEach((d) => expect(d).toMatch(/validationMiddleware/));
        const ctrl = src("trade.controller.js");
        const calls = ctrl.match(/Service\.\w+\([^)]*\)/g) || [];
        calls.forEach((c) => expect(c).toMatch(/req\.user\.id/));
    });
});
