// dbRead.js reads process.env and calls mysql2's createPool at module
// load time, so each scenario below needs a fresh module registry
// (jest.resetModules) and its own require() - reusing a single
// `require("../../../src/config/dbRead")` across tests would only ever
// exercise whatever env was set the first time it was loaded.
const mockPrimaryPool = { query: jest.fn(), __marker: "primary" };

jest.mock("../../../src/config/db", () => mockPrimaryPool);

const mockReplicaPool = { query: jest.fn(), on: jest.fn(), __marker: "replica" };
const mockCreatePool = jest.fn(() => mockReplicaPool);

jest.mock("mysql2/promise", () => ({ createPool: (...args) => mockCreatePool(...args) }));

const ENV_KEYS = [
    "DB_READ_HOST", "DB_READ_PORT", "DB_READ_USER", "DB_READ_PASSWORD", "DB_READ_NAME",
    "DB_READ_SSL", "DB_READ_SSL_REJECT_UNAUTHORIZED", "DB_READ_SSL_CA", "DB_READ_SSL_CA_PATH",
    "DB_READ_CONNECTION_LIMIT", "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME",
    "DB_SSL", "DB_SSL_REJECT_UNAUTHORIZED"
];

describe("config/dbRead", () => {
    const originalEnv = {};

    beforeEach(() => {
        jest.resetModules();
        mockCreatePool.mockClear();
        for (const key of ENV_KEYS) {
            originalEnv[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        }
    });

    it("re-exports the primary pool untouched when DB_READ_HOST is unset (opt-out is a true no-op)", () => {
        const dbRead = require("../../../src/config/dbRead");

        expect(dbRead).toBe(mockPrimaryPool);
        expect(mockCreatePool).not.toHaveBeenCalled();
    });

    it("creates a dedicated pool pointed at DB_READ_HOST when configured", () => {
        process.env.DB_READ_HOST = "replica.example.com";
        process.env.DB_HOST = "primary.example.com";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "app";
        process.env.DB_PASSWORD = "secret";
        process.env.DB_NAME = "nexora";

        const dbRead = require("../../../src/config/dbRead");

        expect(dbRead).toBe(mockReplicaPool);
        expect(mockCreatePool).toHaveBeenCalledTimes(1);
        const config = mockCreatePool.mock.calls[0][0];
        expect(config.host).toBe("replica.example.com");
        // Falls back to the primary's DB_PORT/USER/PASSWORD/NAME when no
        // DB_READ_* equivalent is set - same credentials, different host
        // is the common case.
        expect(config.port).toBe("3306");
        expect(config.user).toBe("app");
        expect(config.password).toBe("secret");
        expect(config.database).toBe("nexora");
    });

    it("prefers DB_READ_* overrides over the primary's DB_* values when both are set", () => {
        process.env.DB_READ_HOST = "replica.example.com";
        process.env.DB_READ_PORT = "3307";
        process.env.DB_READ_USER = "readonly_app";
        process.env.DB_READ_PASSWORD = "replica-secret";
        process.env.DB_READ_NAME = "nexora_replica";
        process.env.DB_HOST = "primary.example.com";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "app";
        process.env.DB_PASSWORD = "secret";
        process.env.DB_NAME = "nexora";

        require("../../../src/config/dbRead");

        const config = mockCreatePool.mock.calls[0][0];
        expect(config.port).toBe("3307");
        expect(config.user).toBe("readonly_app");
        expect(config.password).toBe("replica-secret");
        expect(config.database).toBe("nexora_replica");
    });

    it("registers an error handler on the replica pool so a dropped connection never crashes the process", () => {
        process.env.DB_READ_HOST = "replica.example.com";

        require("../../../src/config/dbRead");

        expect(mockReplicaPool.on).toHaveBeenCalledWith("error", expect.any(Function));
    });
});
