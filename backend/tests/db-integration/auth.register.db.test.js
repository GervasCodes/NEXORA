const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const db = require("../../src/config/db");
const authService = require("../../src/modules/auth/auth.service");
const fixtures = require("./helpers/dbFixtures");

beforeEach(async () => {
    await fixtures.resetTables();
});

afterAll(async () => {
    await fixtures.closePool();
});

const buyerPayload = (overrides = {}) => ({
    first_name: "Amina",
    last_name: "Juma",
    email: `amina-${Date.now()}@example.test`,
    phone: `+25570${Date.now()}`,
    password: "correct horse battery staple",
    role: "buyer",
    terms_accepted: true,
    ...overrides
});

describe("auth.service.register (real database)", () => {
    it("creates a real user row with a bcrypt-hashed password and returns a valid JWT", async () => {
        const payload = buyerPayload();

        const result = await authService.register(payload);

        expect(result.account_verification_status).toBe("not_required");
        expect(typeof result.userId).toBe("number");

        const [[row]] = await db.query("SELECT * FROM users WHERE id = ?", [result.userId]);
        expect(row.email).toBe(payload.email);
        expect(row.password).not.toBe(payload.password); // never stored in plaintext
        await expect(bcrypt.compare(payload.password, row.password)).resolves.toBe(true);

        const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
        expect(decoded).toEqual(expect.objectContaining({ id: result.userId, role: "buyer" }));
    });

    it("rejects registration with an email that's already taken and writes no row", async () => {
        const existing = buyerPayload();
        await authService.register(existing);

        const before = await db.query("SELECT COUNT(*) AS n FROM users");

        await expect(
            authService.register(buyerPayload({ email: existing.email, phone: `+25571${Date.now()}` }))
        ).rejects.toThrow("Email already exists");

        const after = await db.query("SELECT COUNT(*) AS n FROM users");
        expect(after[0][0].n).toBe(before[0][0].n); // no partial write from the rejected attempt
    });

    it("rejects registration with a phone number that's already taken", async () => {
        const existing = buyerPayload();
        await authService.register(existing);

        await expect(
            authService.register(buyerPayload({ phone: existing.phone, email: `other-${Date.now()}@example.test` }))
        ).rejects.toThrow("Phone number already exists");
    });

    it("rejects a seller registration with no verification documents attached, and writes no row", async () => {
        const payload = buyerPayload({ role: "seller", email: `seller-${Date.now()}@example.test` });

        const before = await db.query("SELECT COUNT(*) AS n FROM users");

        await expect(authService.register(payload, {})).rejects.toThrow(/upload/i);

        const after = await db.query("SELECT COUNT(*) AS n FROM users");
        expect(after[0][0].n).toBe(before[0][0].n);
    });

    it("rejects registration without terms_accepted, and writes no row", async () => {
        const payload = buyerPayload({ terms_accepted: false });

        const before = await db.query("SELECT COUNT(*) AS n FROM users");

        await expect(authService.register(payload)).rejects.toThrow("TERMS_NOT_ACCEPTED");

        const after = await db.query("SELECT COUNT(*) AS n FROM users");
        expect(after[0][0].n).toBe(before[0][0].n);
    });
});
