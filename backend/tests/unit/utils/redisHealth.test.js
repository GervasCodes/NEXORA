jest.mock("../../../src/config/redis", () => ({ isConfigured: jest.fn(), getClient: jest.fn() }));
const redisConfig = require("../../../src/config/redis");
const { getRedisStatus } = require("../../../src/utils/redisHealth");

describe("getRedisStatus", () => {
    beforeEach(() => jest.clearAllMocks());

    it("is 'disabled' when Redis is not configured", async () => {
        redisConfig.isConfigured.mockReturnValue(false);
        expect(await getRedisStatus()).toBe("disabled");
        expect(redisConfig.getClient).not.toHaveBeenCalled();
    });

    it("is 'ok' when PING answers PONG", async () => {
        redisConfig.isConfigured.mockReturnValue(true);
        redisConfig.getClient.mockReturnValue({ ping: jest.fn().mockResolvedValue("PONG") });
        expect(await getRedisStatus()).toBe("ok");
    });

    it("is 'unavailable' when PING rejects", async () => {
        redisConfig.isConfigured.mockReturnValue(true);
        redisConfig.getClient.mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error("down")) });
        expect(await getRedisStatus()).toBe("unavailable");
    });

    it("is 'unavailable' (and returns quickly) when PING hangs", async () => {
        redisConfig.isConfigured.mockReturnValue(true);
        redisConfig.getClient.mockReturnValue({ ping: () => new Promise(() => {}) });
        const started = Date.now();
        expect(await getRedisStatus(50)).toBe("unavailable");
        expect(Date.now() - started).toBeLessThan(500);
    });

    it("is 'disabled' when configured but no client can be built", async () => {
        redisConfig.isConfigured.mockReturnValue(true);
        redisConfig.getClient.mockReturnValue(null);
        expect(await getRedisStatus()).toBe("disabled");
    });
});
