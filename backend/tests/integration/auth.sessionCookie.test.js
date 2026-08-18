jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("bcrypt", () => ({
    compare: jest.fn(),
    hash: jest.fn().mockResolvedValue("hashed-code")
}));

const request = require("supertest");
const bcrypt = require("bcrypt");
const db = require("../../src/config/db");
const app = require("../../src/app");
const { generateShortLivedToken } = require("../../src/utils/shortLivedToken");

const PRE_AUTH_TYP = "login_otp";

const validPreAuthToken = (userId = 7) =>
    generateShortLivedToken(PRE_AUTH_TYP, { id: userId }, "10m");

const activeUserRow = (overrides = {}) => ({
    id: 7,
    email: "jane@example.com",
    password: "hashed",
    role: "buyer",
    is_active: 1,
    token_version: 0,
    language: "en",
    ...overrides
});

const activeOtpRow = (overrides = {}) => ({
    id: 55,
    code_hash: "hashed-code",
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    max_attempts: 5,
    ...overrides
});

// Mocks the exact DB call sequence verifyLoginOtp makes: findById (the
// user), findActive (the OTP row), then consume (an UPDATE, no rows
// needed back). See login.service.js / otp.service.js#verifyOtp.
const mockSuccessfulOtpVerification = (userOverrides = {}) => {
    db.query
        .mockResolvedValueOnce([[activeUserRow(userOverrides)]]) // findById
        .mockResolvedValueOnce([[activeOtpRow()]]) // otpRepository.findActive
        .mockResolvedValueOnce([{}]); // otpRepository.consume
    bcrypt.compare.mockResolvedValueOnce(true);
};

describe("POST /api/v1/auth/login/verify-otp - session cookie issuance", () => {
    it("sets an httpOnly session cookie and a readable CSRF cookie, and never returns the token in the response body", async () => {
        mockSuccessfulOtpVerification();

        const res = await request(app)
            .post("/api/v1/auth/login/verify-otp")
            .send({ pre_auth_token: validPreAuthToken(), code: "123456" });

        expect(res.status).toBe(200);
        expect(res.body.data.user).toBeDefined();
        expect(res.body.data.user.id).toBe(7);
        // The whole point of this migration - a token that leaked into
        // the response body would be readable by any JS on the page,
        // same as the old localStorage scheme.
        expect(res.body.data.token).toBeUndefined();
        expect(res.body.data.user.password).toBeUndefined();

        const cookies = res.headers["set-cookie"];
        expect(cookies).toBeDefined();

        const sessionCookie = cookies.find((c) => c.startsWith("nexora_session="));
        const csrfCookie = cookies.find((c) => c.startsWith("nexora_csrf="));

        expect(sessionCookie).toBeDefined();
        expect(sessionCookie).toMatch(/HttpOnly/i);
        expect(sessionCookie).toMatch(/SameSite=Strict/i);

        expect(csrfCookie).toBeDefined();
        // The defining property of the CSRF cookie: NOT HttpOnly, so the
        // frontend's own JS can read it and echo it back as a header.
        expect(csrfCookie).not.toMatch(/HttpOnly/i);
    });
});

describe("session cookie authentication end-to-end", () => {
    it("authenticates a subsequent request using only the session cookie, no Authorization header", async () => {
        const agent = request.agent(app); // follows cookies across requests, like a real browser

        mockSuccessfulOtpVerification();
        const loginRes = await agent
            .post("/api/v1/auth/login/verify-otp")
            .send({ pre_auth_token: validPreAuthToken(), code: "123456" });
        expect(loginRes.status).toBe(200);

        db.query.mockReset();
        // auth.middleware's findAccountStatusById query, then /auth/me's
        // own findById.
        db.query.mockResolvedValueOnce([[{ is_active: 1, token_version: 0, suspended_at: null, last_active_at: new Date() }]]);
        db.query.mockResolvedValueOnce([[activeUserRow()]]);

        const meRes = await agent.get("/api/v1/auth/me");

        expect(meRes.status).toBe(200);
        expect(meRes.body.data.user.id).toBe(7);
    });

    it("rejects a protected request with no cookie and no Authorization header", async () => {
        const res = await request(app).get("/api/v1/auth/me");
        expect(res.status).toBe(401);
    });
});

describe("CSRF protection on cookie-authenticated requests", () => {
    const setupAuthenticatedAgent = async () => {
        const agent = request.agent(app);
        mockSuccessfulOtpVerification();
        await agent
            .post("/api/v1/auth/login/verify-otp")
            .send({ pre_auth_token: validPreAuthToken(), code: "123456" });
        return agent;
    };

    it("rejects a cookie-authenticated mutating request with no X-CSRF-Token header", async () => {
        const agent = await setupAuthenticatedAgent();

        const res = await agent.post("/api/v1/auth/logout");
        // logout itself is CSRF-exempt in practice? No - it's a real
        // mutating request through the global middleware, so it IS
        // checked. Assert the 403 CSRF rejection specifically.
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("CSRF_TOKEN_INVALID");
    });

    it("rejects a cookie-authenticated mutating request with a wrong X-CSRF-Token header", async () => {
        const agent = await setupAuthenticatedAgent();

        const res = await agent
            .post("/api/v1/auth/logout")
            .set("X-CSRF-Token", "not-the-right-token");

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("CSRF_TOKEN_INVALID");
    });

    it("does not require a CSRF header for a Bearer-authenticated mutating request", async () => {
        // No cookie at all here - a Bearer-only client (the existing
        // backend test suite's normal pattern, or a non-browser API
        // consumer) must be unaffected by CSRF protection, which only
        // exists to guard the cookie-driven path.
        const res = await request(app)
            .post("/api/v1/auth/logout")
            .set("Authorization", "Bearer some-token-value");

        expect(res.status).not.toBe(403);
    });
});

describe("POST /api/v1/auth/logout", () => {
    it("clears both the session and CSRF cookies", async () => {
        const agent = request.agent(app);
        mockSuccessfulOtpVerification();
        const loginRes = await agent
            .post("/api/v1/auth/login/verify-otp")
            .send({ pre_auth_token: validPreAuthToken(), code: "123456" });

        // Pull the CSRF cookie value straight out of login's own
        // Set-Cookie header, so this request can present a genuinely
        // matching X-CSRF-Token (the agent tracks cookies internally for
        // supertest's own use, but doesn't expose a public read API for
        // a test to inspect them).
        const csrfSetCookie = loginRes.headers["set-cookie"].find((c) => c.startsWith("nexora_csrf="));
        const csrfValue = csrfSetCookie.split(";")[0].split("=")[1];

        const res = await agent
            .post("/api/v1/auth/logout")
            .set("X-CSRF-Token", csrfValue);

        expect(res.status).toBe(200);

        const cookies = res.headers["set-cookie"];
        const clearedSession = cookies.find((c) => c.startsWith("nexora_session="));
        const clearedCsrf = cookies.find((c) => c.startsWith("nexora_csrf="));

        // res.clearCookie sends the cookie back with an empty value and
        // an already-past Expires date - both signal the browser to
        // delete it.
        expect(clearedSession).toMatch(/nexora_session=;/);
        expect(clearedCsrf).toMatch(/nexora_csrf=;/);
    });
});
