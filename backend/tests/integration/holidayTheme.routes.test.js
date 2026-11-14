// Public holiday-theme endpoint and the admin-only way of changing it, through the real Express app
// (only the database is mocked).
process.env.LOADTEST_BYPASS_TOKEN = "holiday-theme-test-token";

jest.mock("../../src/config/db", () => require("../helpers/mockDb"));

const request = require("supertest");
const jwt = require("jsonwebtoken");

// The settings service caches platform_settings for 30s per process, so each scenario loads a fresh app.
const loadApp = (settings, { failRead = false } = {}) => {
    let app;
    jest.isolateModules(() => {
        const db = require("../../src/config/db");
        db.query.mockReset();
        db.query.mockImplementation(async (sql) => {
            if (/FROM platform_settings/.test(sql)) {
                if (failRead) throw new Error("db down");
                return [Object.entries(settings).map(([setting_key, setting_value]) => ({ setting_key, setting_value, updated_at: new Date("2026-01-01T00:00:00Z") }))];
            }
            // account lookup for the auth middleware
            return [[{ is_active: 1, deleted_at: null, suspended_at: null, token_version: 0, last_active_at: new Date() }]];
        });
        app = require("../../src/app");
    });
    return app;
};

const bypass = { "X-Loadtest-Bypass-Token": process.env.LOADTEST_BYPASS_TOKEN };
const token = (role) => jwt.sign({ id: 1, role, tv: 0, language: "en" }, process.env.JWT_SECRET, { expiresIn: "10m" });

describe("GET /api/v1/holiday-theme (public)", () => {
    const savedEnv = { ...process.env };
    afterEach(() => { process.env = { ...savedEnv }; });

    it("needs no login and is off by default", async () => {
        const res = await request(loadApp({})).get("/api/v1/holiday-theme").set(bypass);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { active: false, mode: null } });
    });

    it("is on for a manual mode, exposes nothing else, and is cacheable for a minute", async () => {
        const res = await request(loadApp({
            holiday_theme_enabled: "true", holiday_theme_mode: "christmas",
            holiday_theme_start_date: "2020-01-01", holiday_theme_end_date: "2099-12-31"
        })).get("/api/v1/holiday-theme").set(bypass);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ active: true, mode: "christmas" });
        expect(res.headers["cache-control"]).toBe("public, max-age=60");
    });

    it("HOLIDAY_THEME_FORCE_OFF=true turns it off whatever the admin saved", async () => {
        process.env.HOLIDAY_THEME_FORCE_OFF = "true";
        const res = await request(loadApp({ holiday_theme_enabled: "true", holiday_theme_mode: "christmas" })).get("/api/v1/holiday-theme").set(bypass);
        expect(res.body.data).toEqual({ active: false, mode: null });
    });

    it("answers 503 (not an error page) when the settings can't be read, and is not cached", async () => {
        const res = await request(loadApp({}, { failRead: true })).get("/api/v1/holiday-theme").set(bypass);
        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.headers["cache-control"]).not.toBe("public, max-age=60");
    });
});

describe("changing the holiday theme is admin-only", () => {
    const app = loadApp({});
    const body = { holiday_theme_enabled: true };

    it("refuses a request with no login (401)", async () => {
        const res = await request(app).put("/api/v1/admin/settings").set(bypass).send(body);
        expect(res.status).toBe(401);
    });

    it.each(["buyer", "seller", "delivery_agent"])("refuses a %s (403)", async (role) => {
        const res = await request(app).put("/api/v1/admin/settings").set(bypass).set("Authorization", `Bearer ${token(role)}`).send(body);
        expect(res.status).toBe(403);
    });

    it("rejects an invalid mode from an admin with a validation error (400)", async () => {
        const res = await request(app).put("/api/v1/admin/settings").set(bypass).set("Authorization", `Bearer ${token("admin")}`)
            .send({ holiday_theme_mode: "easter" });
        expect(res.status).toBe(400);
    });

    it("rejects a malformed date from an admin (400)", async () => {
        const res = await request(app).put("/api/v1/admin/settings").set(bypass).set("Authorization", `Bearer ${token("admin")}`)
            .send({ holiday_theme_start_date: "25/12/2026" });
        expect(res.status).toBe(400);
    });
});
