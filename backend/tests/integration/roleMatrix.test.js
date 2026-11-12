// Role matrix: every route that is restricted to specific roles must refuse a signed-in user of any OTHER
// role with 403, and every route behind a login must refuse a request with no credentials with 401.
//
// The route list is read from the source by scripts/routeInventory.js (the same scanner that keeps
// docs/openapi.yaml in step), so a new route is covered automatically. The real Express app and the real
// auth/role middleware run; only the database is mocked, and no request reaches a controller because a
// refused request stops at the guard.
//
// This proves the ROUTE guards. Object-level ownership is in tests/unit/ownership.test.js (order, booking, dispute,
// saved address, payment, conversation), plus the return and support tests.
process.env.LOADTEST_BYPASS_TOKEN = "role-matrix-test-token"; // lets this test exceed the 600-requests-per-window API limiter (never active in production)

jest.mock("../../src/config/db", () => require("../helpers/mockDb"));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const db = require("../../src/config/db");
const app = require("../../src/app");
const { buildInventory } = require("../../scripts/routeInventory");

const ROLES = ["buyer", "seller", "delivery_agent", "admin"];
const token = (role) => jwt.sign({ id: 1, role, tv: 0, language: "en" }, process.env.JWT_SECRET, { expiresIn: "10m" });
const TOKENS = Object.fromEntries(ROLES.map((r) => [r, token(r)]));

const rolesOf = (route) => route.guards.filter((g) => g.startsWith("role:")).map((g) => g.slice(5));
const concretePath = (p) => p.replace(/\{[^}]+\}/g, "1");

const call = (route, bearer) => {
    const agent = request(app)[route.method.toLowerCase()](concretePath(route.path)).set("X-Loadtest-Bypass-Token", process.env.LOADTEST_BYPASS_TOKEN);
    return bearer ? agent.set("Authorization", `Bearer ${bearer}`) : agent;
};

const routes = buildInventory();
const roleRestricted = routes.filter((r) => rolesOf(r).length > 0);
const loginRequired = routes.filter((r) => r.guards.includes("auth") || rolesOf(r).length > 0);

beforeEach(() => {
    db.query.mockReset();
    // Account lookup used by the auth middleware: an active, non-suspended account with token version 0.
    db.query.mockImplementation(async () => [[{ is_active: 1, deleted_at: null, suspended_at: null, token_version: 0, last_active_at: new Date() }]]);
});

describe("role matrix (route guards)", () => {
    it("finds a realistic number of routes", () => {
        expect(roleRestricted.length).toBeGreaterThan(300);
        expect(loginRequired.length).toBeGreaterThan(roleRestricted.length - 1);
    });

    it("every role-restricted route answers 403 to a signed-in user of a different role", async () => {
        const failures = [];
        for (const route of roleRestricted) {
            const allowed = rolesOf(route);
            for (const role of ROLES.filter((r) => !allowed.includes(r))) {
                const res = await call(route, TOKENS[role]);
                if (res.status !== 403) failures.push(`${route.method} ${route.path} as ${role} (allowed: ${allowed.join("/")}) -> ${res.status}`);
            }
        }
        expect(failures).toEqual([]);
    }, 120_000);

    it("every route behind a login answers 401 when no credentials are sent", async () => {
        const failures = [];
        for (const route of loginRequired) {
            const res = await call(route, null);
            if (res.status !== 401) failures.push(`${route.method} ${route.path} -> ${res.status}`);
        }
        expect(failures).toEqual([]);
    }, 120_000);

    it("positive control: the CORRECT role is not refused by the guard (so the test above is not passing vacuously)", async () => {
        // Routes guarded only by login + one simple role (no approval / feature / super-admin guards).
        const simple = roleRestricted.filter((r) => r.method === "GET" && rolesOf(r).length === 1 && r.guards.every((g) => g === "auth" || g.startsWith("role:") || g.endsWith("Limiter")));
        const sample = [...simple.filter((r) => rolesOf(r)[0] === "admin").slice(0, 10), ...simple.filter((r) => rolesOf(r)[0] === "buyer").slice(0, 10)];
        expect(sample.length).toBeGreaterThanOrEqual(10);
        for (const route of sample) {
            const res = await call(route, TOKENS[rolesOf(route)[0]]);
            // Whatever the handler then does with the mocked database (200, 400, 404, 500), it is not the guard saying no.
            expect([401, 403]).not.toContain(res.status);
        }
    });

    it("a token for a suspended or deactivated account is refused on a protected route", async () => {
        const route = roleRestricted.find((r) => rolesOf(r).includes("buyer"));
        db.query.mockImplementation(async () => [[{ is_active: 0, suspended_at: new Date(), suspension_reason: "test", token_version: 0 }]]);
        expect((await call(route, TOKENS.buyer)).status).toBe(403);
        db.query.mockImplementation(async () => [[{ is_active: 0, suspended_at: null, token_version: 0 }]]);
        expect((await call(route, TOKENS.buyer)).status).toBe(401);
    });

    it("a token with an outdated token_version (sessions revoked) is refused", async () => {
        const route = roleRestricted.find((r) => rolesOf(r).includes("buyer"));
        db.query.mockImplementation(async () => [[{ is_active: 1, token_version: 3 }]]);
        expect((await call(route, TOKENS.buyer)).status).toBe(401);
    });

    it("a malformed token or one signed with another secret is refused", async () => {
        const route = roleRestricted[0];
        expect((await call(route, "not-a-jwt")).status).toBe(401);
        const forged = jwt.sign({ id: 1, role: "admin", tv: 0 }, "some-other-secret");
        expect((await call(route, forged)).status).toBe(401);
    });

    it("a short-lived pre-auth (login OTP) token cannot be used as a session", async () => {
        const preAuth = jwt.sign({ id: 1, role: "admin", typ: "login_otp", tv: 0 }, process.env.JWT_SECRET, { expiresIn: "10m" });
        const route = roleRestricted.find((r) => rolesOf(r).includes("admin"));
        expect((await call(route, preAuth)).status).toBe(401);
    });
});
