jest.mock("../../src/config/db", () => require("../helpers/mockDb"));

const request = require("supertest");
const db = require("../../src/config/db");
const app = require("../../src/app");
const { generateShortLivedToken } = require("../../src/utils/shortLivedToken");

const lockedUserRow = (minutesLeft = 4) => ({
    id: 7,
    email: "jane@example.com",
    password: "hashed",
    role: "buyer",
    is_active: 1,
    token_version: 0,
    language: "en",
    failed_login_attempts: 5,
    last_failed_login_at: new Date(),
    login_locked_until: new Date(Date.now() + minutesLeft * 60 * 1000)
});

const preAuthToken = () => generateShortLivedToken("login_otp", { id: 7 }, "10m");

beforeEach(() => {
    db.query.mockReset();
});

describe("POST /api/v1/auth/login - locked account", () => {
    it("answers 429 with a Retry-After header, the wait in minutes, and a machine-readable code", async () => {
        db.query.mockResolvedValueOnce([[lockedUserRow(4)]]); // findByEmail

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "jane@example.com", password: "whatever" });

        expect(res.status).toBe(429);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe("ACCOUNT_LOCKED");
        expect(res.body.message).toMatch(/4 minute/);
        expect(res.body.data.retryAfterSeconds).toBeGreaterThan(3 * 60);
        expect(Number(res.headers["retry-after"])).toBe(res.body.data.retryAfterSeconds);
    });

    it("translates the message for Swahili clients", async () => {
        db.query.mockResolvedValueOnce([[lockedUserRow(4)]]);

        const res = await request(app)
            .post("/api/v1/auth/login")
            .set("Accept-Language", "sw")
            .send({ email: "jane@example.com", password: "whatever" });

        expect(res.status).toBe(429);
        expect(res.body.message).toMatch(/dakika 4/);
    });
});

describe("POST /api/v1/auth/login/verify-otp and /resend-otp - locked account", () => {
    it("rejects OTP verification with 429 and the same Retry-After contract", async () => {
        db.query.mockResolvedValueOnce([[lockedUserRow(9)]]); // findById

        const res = await request(app)
            .post("/api/v1/auth/login/verify-otp")
            .send({ pre_auth_token: preAuthToken(), code: "123456" });

        expect(res.status).toBe(429);
        expect(res.body.data.retryAfterSeconds).toBeGreaterThan(8 * 60);
        expect(res.headers["retry-after"]).toBeDefined();
    });

    it("rejects OTP resend with 429 instead of emailing a new code", async () => {
        db.query.mockResolvedValueOnce([[lockedUserRow(9)]]); // findById

        const res = await request(app)
            .post("/api/v1/auth/login/resend-otp")
            .send({ pre_auth_token: preAuthToken() });

        expect(res.status).toBe(429);
        // Only the user lookup ran - no OTP row was created, no email sent.
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});

describe("POST /api/v1/auth/login - unknown email", () => {
    it("still answers a plain 401 INVALID_CREDENTIALS with no lockout hints in the response", async () => {
        db.query.mockResolvedValueOnce([[]]); // findByEmail -> no user

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "nobody@example.com", password: "whatever" });

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("INVALID_CREDENTIALS");
        expect(res.headers["retry-after"]).toBeUndefined();
        expect(res.body.data).toBeUndefined();
        // The monitoring-only reason tag must never reach the client.
        expect(JSON.stringify(res.body)).not.toContain("unknown_email");
    });
});
