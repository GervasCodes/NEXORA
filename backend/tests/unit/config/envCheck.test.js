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

describe("envCheck.fatal (conditions that stop startup)", () => {
    let originalEnv;
    beforeEach(() => { originalEnv = { ...process.env }; });
    afterEach(() => { process.env = originalEnv; });

    it("is clean for a normal production configuration", () => {
        process.env.NODE_ENV = "production";
        process.env.DB_HOST = "db.example.com";
        expect(envCheck.fatal()).toEqual([]);
    });

    it.each(["prod", "Production", "staging", "PRODUCTION "])("rejects a mistyped NODE_ENV (%p)", (value) => {
        process.env.NODE_ENV = value;
        const problems = envCheck.fatal();
        expect(problems.length).toBeGreaterThan(0);
        expect(problems[0]).toContain("NODE_ENV");
    });

    it("rejects a non-production process pointed at a non-local database", () => {
        process.env.NODE_ENV = "development";
        process.env.DB_HOST = "mysql-abc.aivencloud.com";
        delete process.env.ALLOW_NON_LOCAL_DEV_DB;
        expect(envCheck.fatal().some((p) => p.includes("DB_HOST is not local"))).toBe(true);
    });

    it("also rejects it when NODE_ENV is unset", () => {
        delete process.env.NODE_ENV;
        process.env.DB_HOST = "10.0.0.5";
        delete process.env.ALLOW_NON_LOCAL_DEV_DB;
        expect(envCheck.fatal().length).toBe(1);
    });

    it.each(["localhost", "127.0.0.1", "::1"])("allows a local database in development (%s)", (host) => {
        process.env.NODE_ENV = "development";
        process.env.DB_HOST = host;
        expect(envCheck.fatal()).toEqual([]);
    });

    it("allows a deliberate shared staging database with ALLOW_NON_LOCAL_DEV_DB=true", () => {
        process.env.NODE_ENV = "development";
        process.env.DB_HOST = "staging-db.example.com";
        process.env.ALLOW_NON_LOCAL_DEV_DB = "true";
        expect(envCheck.fatal()).toEqual([]);
    });
});

describe("envCheck.strictProblems (production security findings)", () => {
    let originalEnv;
    beforeEach(() => { originalEnv = { ...process.env }; process.env.NODE_ENV = "production"; });
    afterEach(() => { process.env = originalEnv; });

    it("reports nothing outside production", () => {
        process.env.NODE_ENV = "development";
        delete process.env.CORS_ORIGIN;
        expect(envCheck.strictProblems()).toEqual([]);
    });

    it("reports an unverified database TLS connection", () => {
        process.env.DB_SSL = "true";
        delete process.env.DB_SSL_CA; delete process.env.DB_SSL_CA_PATH; delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
        expect(envCheck.strictProblems().some((p) => p.includes("DB_SSL"))).toBe(true);
    });

    it("accepts DB TLS with a CA or with verification switched on", () => {
        process.env.DB_SSL = "true";
        process.env.DB_SSL_CA = "-----BEGIN CERTIFICATE-----x";
        expect(envCheck.strictProblems().some((p) => p.includes("DB_SSL"))).toBe(false);
        delete process.env.DB_SSL_CA;
        process.env.DB_SSL_REJECT_UNAUTHORIZED = "true";
        expect(envCheck.strictProblems().some((p) => p.includes("DB_SSL"))).toBe(false);
    });

    it("reports a missing CORS_ORIGIN, a short JWT secret and an open Selcom webhook", () => {
        delete process.env.CORS_ORIGIN;
        process.env.JWT_SECRET = "short";
        process.env.MOBILE_MONEY_PROVIDER = "selcom";
        delete process.env.SELCOM_WEBHOOK_ALLOWED_IPS;
        const text = envCheck.strictProblems().join("\n");
        expect(text).toContain("CORS_ORIGIN");
        expect(text).toContain("JWT_SECRET");
        expect(text).toContain("SELCOM_WEBHOOK_ALLOWED_IPS");
    });

    it.each(["ALLOW_UNSIGNED_WEBHOOKS", "ALLOW_PLATFORM_DATA_RESET", "ALLOW_PLATFORM_DATA_RESET_REAL", "LOADTEST_BYPASS_TOKEN"])(
        "reports the test-only switch %s when set in production", (name) => {
            process.env[name] = "true";
            expect(envCheck.strictProblems().some((p) => p.includes(name))).toBe(true);
        });
});

describe("envCheck.enforce", () => {
    let originalEnv;
    const quietLogger = () => ({ warn: jest.fn(), fatal: jest.fn(), error: jest.fn(), log: jest.fn() });
    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.JWT_SECRET = "x".repeat(40);
        process.env.DB_HOST = "127.0.0.1"; process.env.DB_USER = "u"; process.env.DB_PASSWORD = "p"; process.env.DB_NAME = "d";
        delete process.env.STRICT_SECURITY_CHECKS;
    });
    afterEach(() => { process.env = originalEnv; });

    it("does not exit for a clean local development configuration", () => {
        process.env.NODE_ENV = "development";
        const exit = jest.fn();
        envCheck.enforce(quietLogger(), exit);
        expect(exit).not.toHaveBeenCalled();
    });

    it("exits with code 1 for a mistyped NODE_ENV", () => {
        process.env.NODE_ENV = "prod";
        const exit = jest.fn();
        const logger = quietLogger();
        envCheck.enforce(logger, exit);
        expect(exit).toHaveBeenCalledWith(1);
        expect(logger.fatal).toHaveBeenCalled();
    });

    it("blocks startup in production when CORS_ORIGIN is missing (mandatory check)", () => {
        process.env.NODE_ENV = "production";
        delete process.env.CORS_ORIGIN;
        const exit = jest.fn();
        envCheck.enforce(quietLogger(), exit);
        expect(exit).toHaveBeenCalledWith(1);
    });

    it("blocks startup in production for unverified database TLS", () => {
        process.env.NODE_ENV = "production";
        process.env.CORS_ORIGIN = "https://nexora.tz";
        process.env.DB_SSL = "true";
        delete process.env.DB_SSL_CA; delete process.env.DB_SSL_CA_PATH; delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
        const exit = jest.fn();
        envCheck.enforce(quietLogger(), exit);
        expect(exit).toHaveBeenCalledWith(1);
    });

    it("blocks startup in production when the Selcom webhook has no secret and no IP list", () => {
        process.env.NODE_ENV = "production";
        process.env.CORS_ORIGIN = "https://nexora.tz";
        process.env.MOBILE_MONEY_PROVIDER = "selcom";
        delete process.env.SELCOM_WEBHOOK_SECRET; delete process.env.SELCOM_WEBHOOK_ALLOWED_IPS;
        delete process.env.DB_SSL;
        const exit = jest.fn();
        envCheck.enforce(quietLogger(), exit);
        expect(exit).toHaveBeenCalledWith(1);
    });

    it("starts in production once the mandatory settings are present", () => {
        process.env.NODE_ENV = "production";
        process.env.CORS_ORIGIN = "https://nexora.tz";
        delete process.env.DB_SSL; delete process.env.MOBILE_MONEY_PROVIDER;
        const exit = jest.fn();
        envCheck.enforce(quietLogger(), exit);
        expect(exit).not.toHaveBeenCalled();
    });

    it("STRICT_SECURITY_CHECKS=false is an explicit, logged opt-out", () => {
        process.env.NODE_ENV = "production";
        process.env.STRICT_SECURITY_CHECKS = "false";
        delete process.env.CORS_ORIGIN;
        const exit = jest.fn();
        const logger = quietLogger();
        envCheck.enforce(logger, exit);
        expect(exit).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("SKIPPED"));
    });

    it("exits on production security findings when STRICT_SECURITY_CHECKS=true", () => {
        process.env.NODE_ENV = "production";
        process.env.STRICT_SECURITY_CHECKS = "true";
        delete process.env.CORS_ORIGIN;
        const exit = jest.fn();
        envCheck.enforce(quietLogger(), exit);
        expect(exit).toHaveBeenCalledWith(1);
    });
});
