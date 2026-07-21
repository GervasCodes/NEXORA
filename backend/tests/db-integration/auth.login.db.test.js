// Real-database integration tests for the login flow (login.service.js).
//
// Only the email transport is mocked (config/brevo.js) - this suite's
// convention (see wallet.requestWithdrawal.db.test.js) is to mock the
// external-boundary module a service calls out to, while everything that
// touches MySQL (users, otp_codes) runs for real. That also means we can
// intercept the actual 6-digit code otp.service generates (it's emailed
// in plaintext before being hashed and stored) to drive step 2 of login
// without needing to read it back out of the OTP table, which only ever
// stores a bcrypt hash by design.
jest.mock("../../src/config/brevo");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { sendTransactionalEmail } = require("../../src/config/brevo");
const db = require("../../src/config/db");
const loginService = require("../../src/modules/auth/login.service");
const fixtures = require("./helpers/dbFixtures");

const PASSWORD = "correct horse battery staple";

// otp.service builds the email body as "<intro>\n\n<code>\n\n<expiry note>"
// (see backend/src/modules/otp/otp.service.js bodyFor()) - pull the code
// back out of whatever text was "sent" rather than re-deriving it.
const extractOtpFromSentEmail = () => {
    const call = sendTransactionalEmail.mock.calls[sendTransactionalEmail.mock.calls.length - 1];
    const { text } = call[0];
    const match = text.match(/\n\n(\d{6})\n\n/);
    if (!match) throw new Error(`Could not find a 6-digit code in the simulated email body: ${text}`);
    return match[1];
};

const seedActiveUser = async (overrides = {}) => {
    const passwordHash = await bcrypt.hash(overrides.password || PASSWORD, 10);
    const email = overrides.email || `login-${Date.now()}@example.test`;

    const [result] = await db.query(
        `INSERT INTO users
        (first_name, last_name, email, phone, password, role, account_verification_status, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 'not_required', ?)`,
        [
            overrides.first_name || "Amina",
            overrides.last_name || "Juma",
            email,
            overrides.phone || `+2557${String(Date.now()).slice(-8)}`,
            passwordHash,
            overrides.role || "buyer",
            overrides.is_active ?? 1
        ]
    );

    return { id: result.insertId, email };
};

beforeEach(async () => {
    await fixtures.resetTables();
    sendTransactionalEmail.mockClear();
    sendTransactionalEmail.mockResolvedValue({ simulated: true });
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("login.service (real database)", () => {
    it("step 1: accepts correct credentials, writes a real otp_codes row, and emails a 6-digit code", async () => {
        const user = await seedActiveUser();

        const result = await loginService.login(user.email, PASSWORD);

        expect(result.preAuthToken).toEqual(expect.any(String));
        expect(result.maskedEmail).toContain("***");

        const [rows] = await db.query(
            "SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'login'",
            [user.id]
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].consumed_at).toBeNull();
        expect(rows[0].attempts).toBe(0);

        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
        expect(sendTransactionalEmail.mock.calls[0][0].to).toBe(user.email);
    });

    it("step 1: rejects a wrong password without creating an otp_codes row", async () => {
        const user = await seedActiveUser();

        await expect(loginService.login(user.email, "wrong password")).rejects.toThrow();

        const [rows] = await db.query("SELECT * FROM otp_codes WHERE user_id = ?", [user.id]);
        expect(rows).toHaveLength(0);
        expect(sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("step 1: rejects a deactivated account", async () => {
        const user = await seedActiveUser({ is_active: 0 });

        await expect(loginService.login(user.email, PASSWORD)).rejects.toThrow(/deactivated/i);
    });

    it("step 1: rejects an email that doesn't exist", async () => {
        await expect(loginService.login("nobody@example.test", PASSWORD)).rejects.toThrow();
    });

    it("full flow: step 2 with the correct code consumes the otp_codes row and issues a real JWT session", async () => {
        const user = await seedActiveUser();
        const { preAuthToken } = await loginService.login(user.email, PASSWORD);
        const code = extractOtpFromSentEmail();

        const { user: sessionUser, token } = await loginService.verifyLoginOtp(preAuthToken, code);

        expect(sessionUser.id).toBe(user.id);
        expect(sessionUser.password).toBeUndefined(); // never leaks the hash

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded).toEqual(expect.objectContaining({ id: user.id, role: "buyer" }));

        const [[otpRow]] = await db.query(
            "SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'login' ORDER BY id DESC LIMIT 1",
            [user.id]
        );
        expect(otpRow.consumed_at).not.toBeNull();
    });

    it("full flow: rejects an incorrect code and increments attempts on the real row, without consuming it", async () => {
        const user = await seedActiveUser();
        const { preAuthToken } = await loginService.login(user.email, PASSWORD);

        await expect(loginService.verifyLoginOtp(preAuthToken, "000000")).rejects.toThrow();

        const [[otpRow]] = await db.query(
            "SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'login' ORDER BY id DESC LIMIT 1",
            [user.id]
        );
        expect(otpRow.attempts).toBe(1);
        expect(otpRow.consumed_at).toBeNull();

        // The real code (from the actual email) still works after one bad attempt.
        const code = extractOtpFromSentEmail();
        const { token } = await loginService.verifyLoginOtp(preAuthToken, code);
        expect(token).toEqual(expect.any(String));
    });

    it("resendLoginOtp invalidates the previous real otp_codes row and creates a new one", async () => {
        const user = await seedActiveUser();
        const { preAuthToken } = await loginService.login(user.email, PASSWORD);

        const [[firstOtp]] = await db.query(
            "SELECT id FROM otp_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1", [user.id]
        );

        await loginService.resendLoginOtp(preAuthToken);

        const [rows] = await db.query(
            "SELECT * FROM otp_codes WHERE user_id = ? ORDER BY id", [user.id]
        );
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.id === firstOtp.id).consumed_at).not.toBeNull();
        expect(rows[1].consumed_at).toBeNull();

        const code = extractOtpFromSentEmail();
        await expect(loginService.verifyLoginOtp(preAuthToken, code)).resolves.toBeDefined();
    });
});
