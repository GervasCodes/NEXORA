jest.mock("../../src/config/db", () => require("../helpers/mockDb"));

const request = require("supertest");
const db = require("../../src/config/db");
const app = require("../../src/app");

describe("GET /health", () => {
    it("returns 200 + ok when the DB ping succeeds", async () => {
        db.query.mockResolvedValueOnce([[{ result: 1 }]]);

        const res = await request(app).get("/health").set("Accept", "application/json");

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ok");
        expect(res.body.database).toBe("connected");
    });

    it("returns 503 + degraded when the DB ping fails, without leaking the error detail", async () => {
        db.query.mockRejectedValueOnce(new Error("ECONNREFUSED"));

        const res = await request(app).get("/health").set("Accept", "application/json");

        expect(res.status).toBe(503);
        expect(res.body.status).toBe("degraded");
        expect(res.body.database).toBe("disconnected");
        expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED/);
    });
});

describe("GET /", () => {
    it("returns the welcome payload", async () => {
        const res = await request(app).get("/");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe("GET /api/v1/me", () => {
    it("requires authentication", async () => {
        const res = await request(app).get("/api/v1/me");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("rejects a malformed bearer token", async () => {
        const res = await request(app).get("/api/v1/me").set("Authorization", "Bearer not-a-real-jwt");
        expect(res.status).toBe(401);
    });
});
