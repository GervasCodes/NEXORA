jest.mock("../../../src/config/db", () => ({ query: jest.fn() }));
jest.mock("../../../src/modules/subscription/trial.repository", () => ({ findTrialForUser: jest.fn() }));
jest.mock("../../../src/modules/subscription/subscription.repository", () => ({ findEntitledForSeller: jest.fn() }));
jest.mock("../../../src/modules/settings/settings.service", () => ({ getStockExportGraceDays: jest.fn().mockResolvedValue(30) }));

const db = require("../../../src/config/db");
const trialRepo = require("../../../src/modules/subscription/trial.repository");
const subRepo = require("../../../src/modules/subscription/subscription.repository");
const requireFeature = require("../../../src/middleware/requireFeature.middleware");
const entitlements = require("../../../src/modules/stock/stock.entitlements");

const run = async (feature, { method = "GET", id = 1 } = {}) => {
    const req = { user: { id }, method };
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    const next = jest.fn();
    await requireFeature(feature)(req, res, next);
    return { req, res, next };
};

const plan = (code, ent, status = "active") => ({ plan_code: code, status, entitlements: ent });

describe("requireFeature (stock plan gate)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        requireFeature.clearCache();
        trialRepo.findTrialForUser.mockResolvedValue({ in_trial: 0 });
        subRepo.findEntitledForSeller.mockResolvedValue(null);
        db.query.mockResolvedValue([[]]);
    });

    it("unlocks everything during the seller trial", async () => {
        trialRepo.findTrialForUser.mockResolvedValue({ in_trial: 1 });
        const { next, req } = await run("stock_cost_reports", { method: "POST" });
        expect(next).toHaveBeenCalled();
        expect(req.stockAccess.mode).toBe("full");
    });

    it("lets a paid plan use the features its entitlements list, and nothing else", async () => {
        subRepo.findEntitledForSeller.mockResolvedValue(plan("starter", JSON.stringify({ stock_pos: true, stock_cost_reports: false })));
        expect((await run("stock_pos")).next).toHaveBeenCalled();
        const denied = await run("stock_cost_reports");
        expect(denied.next).not.toHaveBeenCalled();
        expect(denied.res.statusCode).toBe(403);
        expect(denied.res.body.code).toBe("FEATURE_NOT_IN_PLAN");
    });

    it("reads entitlements from the plan row (a settings change, not code)", async () => {
        subRepo.findEntitledForSeller.mockResolvedValue(plan("growth", { stock_pos: true, stock_cost_reports: true }));
        expect((await run("stock_cost_reports")).next).toHaveBeenCalled();
    });

    it("keeps the Free plan out of Stock Management with a plan message", async () => {
        subRepo.findEntitledForSeller.mockResolvedValue(plan("free", null));
        const r = await run("stock_pos");
        expect(r.res.statusCode).toBe(403);
        expect(r.res.body.code).toBe("FEATURE_NOT_IN_PLAN");
    });

    it("asks for a plan once the trial is over and nothing was ever paid", async () => {
        const r = await run("stock_pos");
        expect(r.res.statusCode).toBe(403);
        expect(r.res.body.code).toBe("SUBSCRIPTION_REQUIRED");
    });

    describe("after a plan lapses", () => {
        const lapsed = (days) => db.query.mockResolvedValue([[{ plan_code: "starter", entitlements: null, days_since: days }]]);

        it("inside the grace period: viewing and exporting (GET) still work", async () => {
            lapsed(5);
            const r = await run("stock_import_export", { method: "GET" });
            expect(r.next).toHaveBeenCalled();
            expect(r.req.stockAccess.mode).toBe("read_only");
        });

        it("inside the grace period: anything that writes is refused, with a read-only message", async () => {
            lapsed(5);
            for (const method of ["POST", "PUT", "DELETE"]) {
                requireFeature.clearCache();
                const r = await run("stock_pos", { method });
                expect(r.next).not.toHaveBeenCalled();
                expect(r.res.statusCode).toBe(403);
                expect(r.res.body).toMatchObject({ code: "SUBSCRIPTION_REQUIRED", read_only: true });
            }
        });

        it("after the grace period: no access at all", async () => {
            lapsed(45);
            const r = await run("stock_pos");
            expect(r.res.statusCode).toBe(403);
            expect(r.next).not.toHaveBeenCalled();
        });
    });

    it("caches the answer so a burst of requests costs one lookup, and invalidate() clears it", async () => {
        subRepo.findEntitledForSeller.mockResolvedValue(plan("starter", null));
        await run("stock_pos"); await run("stock_pos"); await run("stock_reports");
        expect(trialRepo.findTrialForUser).toHaveBeenCalledTimes(1);
        expect(subRepo.findEntitledForSeller).toHaveBeenCalledTimes(1);
        requireFeature.invalidate(1);
        await run("stock_pos");
        expect(subRepo.findEntitledForSeller).toHaveBeenCalledTimes(2);
    });

    it("never shares a cached answer between sellers", async () => {
        subRepo.findEntitledForSeller.mockResolvedValueOnce(plan("pro", null)).mockResolvedValueOnce(null);
        expect((await run("stock_pos", { id: 1 })).next).toHaveBeenCalled();
        expect((await run("stock_pos", { id: 2 })).res.statusCode).toBe(403);
    });
});

describe("stock.entitlements", () => {
    it("falls back to sensible defaults for a paid plan with none stored, and none for Free", () => {
        expect(entitlements.forPlan("custom", null)).toMatchObject({ stock_pos: true, stock_cost_reports: false });
        expect(entitlements.forPlan("free", null).stock_pos).toBe(false);
    });
    it("ignores unknown or mistyped stored values", () => {
        const e = entitlements.forPlan("custom", { stock_cost_reports: "yes", stock_max_items: -3, hack: true });
        expect(e.stock_cost_reports).toBe(false);
        expect(e.stock_max_items).toBeNull();
        expect(e.hack).toBeUndefined();
    });
    it("validates what an admin may save", () => {
        expect(entitlements.isValid({ stock_pos: true, stock_max_items: null })).toBe(true);
        expect(entitlements.isValid({ stock_pos: "true" })).toBe(false);
        expect(entitlements.isValid({ nope: true })).toBe(false);
        expect(entitlements.isValid([])).toBe(false);
    });
});
