const envCheck = require("../../../src/config/envCheck");

describe("envCheck.check", () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("flags AADMIN_EMAIL as a near-miss of ADMIN_EMAIL (the real bug this check exists for)", () => {
        process.env.AADMIN_EMAIL = "admin@example.com";
        delete process.env.ADMIN_EMAIL;

        const problems = envCheck.check();

        expect(problems.some((p) => p.includes('"AADMIN_EMAIL"') && p.includes('"ADMIN_EMAIL"'))).toBe(true);
    });

    it("does not flag a correctly-spelled known var", () => {
        process.env.ADMIN_EMAIL = "admin@example.com";

        const problems = envCheck.check();

        expect(problems.some((p) => p.includes("ADMIN_EMAIL"))).toBe(false);
    });

    it("does not flag an unrelated, non-typo-like unknown var (e.g. a CI/shell var)", () => {
        process.env.SOME_COMPLETELY_UNRELATED_THING = "x";

        const problems = envCheck.check();

        expect(problems.some((p) => p.includes("SOME_COMPLETELY_UNRELATED_THING"))).toBe(false);
    });

    it("flags a missing required var (e.g. JWT_SECRET)", () => {
        delete process.env.JWT_SECRET;

        const problems = envCheck.check();

        expect(problems.some((p) => p.includes('"JWT_SECRET" is not set'))).toBe(true);
    });

    it("flags MOBILE_MONEY_PROVIDER unset in production, but not outside production", () => {
        delete process.env.MOBILE_MONEY_PROVIDER;

        process.env.NODE_ENV = "production";
        expect(envCheck.check().some((p) => p.includes("MOBILE_MONEY_PROVIDER"))).toBe(true);

        process.env.NODE_ENV = "test";
        expect(envCheck.check().some((p) => p.includes("MOBILE_MONEY_PROVIDER"))).toBe(false);
    });

    it("flags a partially-set admin seed group (suspicious) but not a fully-unset one (normal, not seeding yet)", () => {
        process.env.ADMIN_EMAIL = "admin@example.com";
        delete process.env.ADMIN_PASSWORD;
        delete process.env.ADMIN_PHONE;

        expect(envCheck.check().some((p) => p.includes("admin seed vars partially set"))).toBe(true);

        delete process.env.ADMIN_EMAIL;
        expect(envCheck.check().some((p) => p.includes("admin seed vars partially set"))).toBe(false);
    });
});
