jest.mock("../../../src/config/redis");

const redis = require("../../../src/config/redis");
const cache = require("../../../src/utils/cache");

// Minimal ioredis-shaped stub - only the methods cache.js actually calls.
const makeClient = () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue("OK"),
    incr: jest.fn().mockResolvedValue(1)
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("cache.getOrSet", () => {
    it("calls fetchFn directly and never touches Redis when no client is configured", async () => {
        redis.getClient.mockReturnValue(null);
        const fetchFn = jest.fn().mockResolvedValue({ hello: "world" });

        const result = await cache.getOrSet("things", { id: 1 }, fetchFn);

        expect(result).toEqual({ hello: "world" });
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("returns the cached value on a hit without calling fetchFn", async () => {
        const client = makeClient();
        client.get
            .mockResolvedValueOnce("1") // version read
            .mockResolvedValueOnce(JSON.stringify({ cached: true })); // key read
        redis.getClient.mockReturnValue(client);
        const fetchFn = jest.fn();

        const result = await cache.getOrSet("things", { id: 1 }, fetchFn);

        expect(result).toEqual({ cached: true });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("calls fetchFn and writes through on a cache miss", async () => {
        const client = makeClient();
        client.get
            .mockResolvedValueOnce("1") // version read
            .mockResolvedValueOnce(null); // key miss
        redis.getClient.mockReturnValue(client);
        const fetchFn = jest.fn().mockResolvedValue({ fresh: true });

        const result = await cache.getOrSet("things", { id: 1 }, fetchFn, 30);

        expect(result).toEqual({ fresh: true });
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(client.set).toHaveBeenCalledWith(
            expect.stringContaining("things:v1:"),
            JSON.stringify({ fresh: true }),
            "EX",
            30
        );
    });

    it("builds the same key regardless of key-part property order (stable hashing)", async () => {
        const client = makeClient();
        client.get.mockResolvedValue(null);
        redis.getClient.mockReturnValue(client);

        await cache.getOrSet("things", { a: 1, b: 2 }, jest.fn().mockResolvedValue(1));
        await cache.getOrSet("things", { b: 2, a: 1 }, jest.fn().mockResolvedValue(1));

        const [keyA] = client.get.mock.calls[1]; // second call's key-read args (after each version read)
        const [keyB] = client.get.mock.calls[3];
        expect(keyA).toBe(keyB);
    });

    it("falls back to fetchFn without throwing when the version read fails", async () => {
        const client = makeClient();
        client.get.mockRejectedValue(new Error("ECONNRESET"));
        redis.getClient.mockReturnValue(client);
        const fetchFn = jest.fn().mockResolvedValue("db-result");

        const result = await cache.getOrSet("things", { id: 1 }, fetchFn);

        expect(result).toBe("db-result");
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("falls back to fetchFn without throwing when the key read fails after a successful version read", async () => {
        const client = makeClient();
        client.get
            .mockResolvedValueOnce("1")
            .mockRejectedValueOnce(new Error("ECONNRESET"));
        redis.getClient.mockReturnValue(client);
        const fetchFn = jest.fn().mockResolvedValue("db-result");

        const result = await cache.getOrSet("things", { id: 1 }, fetchFn);

        expect(result).toBe("db-result");
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("still returns fetchFn's result even when the cache write fails", async () => {
        const client = makeClient();
        client.get.mockResolvedValueOnce("1").mockResolvedValueOnce(null);
        client.set.mockRejectedValue(new Error("write failed"));
        redis.getClient.mockReturnValue(client);

        const result = await cache.getOrSet("things", { id: 1 }, jest.fn().mockResolvedValue("ok"));

        expect(result).toBe("ok");
    });
});

describe("cache.bumpVersion", () => {
    it("is a no-op when no client is configured", async () => {
        redis.getClient.mockReturnValue(null);

        await expect(cache.bumpVersion("things")).resolves.toBeUndefined();
    });

    it("increments the namespace's version key", async () => {
        const client = makeClient();
        redis.getClient.mockReturnValue(client);

        await cache.bumpVersion("things");

        expect(client.incr).toHaveBeenCalledWith("cache:v:things");
    });

    it("swallows errors rather than throwing", async () => {
        const client = makeClient();
        client.incr.mockRejectedValue(new Error("down"));
        redis.getClient.mockReturnValue(client);

        await expect(cache.bumpVersion("things")).resolves.toBeUndefined();
    });

    it("orphans a previously cached entry once bumped", async () => {
        const client = makeClient();
        redis.getClient.mockReturnValue(client);

        // First read: version 1, miss, write-through under v1.
        client.get.mockResolvedValueOnce("1").mockResolvedValueOnce(null);
        await cache.getOrSet("things", { id: 1 }, jest.fn().mockResolvedValue("v1-data"));

        await cache.bumpVersion("things");

        // Second read: version now 2 - must not reuse the v1 key/entry,
        // even though nothing has explicitly deleted it.
        client.get.mockResolvedValueOnce("2").mockResolvedValueOnce(null);
        const fetchFn = jest.fn().mockResolvedValue("v2-data");
        const result = await cache.getOrSet("things", { id: 1 }, fetchFn);

        expect(result).toBe("v2-data");
        expect(fetchFn).toHaveBeenCalledTimes(1);
        const v1Key = client.set.mock.calls[0][0];
        const v2Key = client.set.mock.calls[1][0];
        expect(v1Key).not.toBe(v2Key);
    });
});
