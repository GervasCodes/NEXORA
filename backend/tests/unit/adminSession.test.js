const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "x".repeat(40);

jest.mock("../../src/modules/auth/auth.repository", () => ({
    findAccountStatusById: jest.fn(),
    touchLastActive: jest.fn(() => Promise.resolve())
}));
const authRepository = require("../../src/modules/auth/auth.repository");
const generateToken = require("../../src/utils/generateToken");
const authMiddleware = require("../../src/middleware/auth.middleware");

const lifetime = (token) => { const d = jwt.decode(token); return d.exp - d.iat; };
const run = async (token) => {
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {}, locale: "en" };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authMiddleware(req, res, next);
    return { req, res, next };
};

describe("session lifetime", () => {
    it("gives administrators an 8 hour session", () => {
        expect(lifetime(generateToken({ id: 1, role: "admin" }))).toBe(8 * 3600);
    });
    it("keeps 7 days for everyone else", () => {
        expect(lifetime(generateToken({ id: 2, role: "buyer" }))).toBe(7 * 86400);
    });
});

describe("role is read from the database, not the token", () => {
    const base = { is_active: 1, token_version: 0, last_active_at: new Date() };
    it("a demoted admin loses admin on the next request", async () => {
        authRepository.findAccountStatusById.mockResolvedValue({ ...base, role: "buyer" });
        const { req, next } = await run(generateToken({ id: 1, role: "admin", tv: 0 }));
        expect(next).toHaveBeenCalled();
        expect(req.user.role).toBe("buyer");
    });
    it("a promoted user is not stuck with the stale token role", async () => {
        authRepository.findAccountStatusById.mockResolvedValue({ ...base, role: "seller" });
        const { req } = await run(generateToken({ id: 3, role: "buyer", tv: 0 }));
        expect(req.user.role).toBe("seller");
    });
    it("rejects a token whose version no longer matches", async () => {
        authRepository.findAccountStatusById.mockResolvedValue({ ...base, role: "admin", token_version: 2 });
        const { res, next } = await run(generateToken({ id: 1, role: "admin", tv: 0 }));
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
