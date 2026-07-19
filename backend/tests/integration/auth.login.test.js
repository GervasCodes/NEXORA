jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/config/brevo", () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("bcrypt", () => ({
    compare: jest.fn(),
    hash: jest.fn().mockResolvedValue("hashed-code")
}));

const request = require("supertest");
const bcrypt = require("bcrypt");
const db = require("../../src/config/db");
const app = require("../../src/app");

describe("POST /api/v1/auth/login", () => {
    it("rejects an unknown email with a generic invalid-credentials message (not a validation error)", async () => {
        db.query.mockResolvedValueOnce([[]]); // findByEmail -> no rows

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "nobody@example.com", password: "whatever123" });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("sends an OTP and returns a masked email + pre-auth token for correct credentials", async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, email: "johndoe@example.com", password: "hashed", is_active: 1 }]]) // findByEmail
            .mockResolvedValueOnce([[{ count: 0 }]]) // otpRepository.countRecent
            .mockResolvedValueOnce([{}]) // otpRepository.invalidateActive
            .mockResolvedValueOnce([{}]); // otpRepository.create

        bcrypt.compare.mockResolvedValueOnce(true);

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "johndoe@example.com", password: "correct-password" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.maskedEmail).toBe("jo***@example.com");
        expect(res.body.data.preAuthToken).toEqual(expect.any(String));
        // Never a real session token/user object at this step.
        expect(res.body.data.user).toBeUndefined();
        expect(res.body.data.token).toBeUndefined();
    });

    it("rejects a deactivated account", async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, email: "a@b.com", password: "hashed", is_active: 0 }]]);
        bcrypt.compare.mockResolvedValueOnce(true);

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "a@b.com", password: "correct-password" });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/deactivated/i);
    });
});

describe("POST /api/v1/auth/register - validation", () => {
    it("returns 400 with field errors for a clearly invalid payload, without touching the DB", async () => {
        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({ email: "not-an-email", password: "short", role: "not-a-real-role" });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(db.query).not.toHaveBeenCalled();
    });
});
