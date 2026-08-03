jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const { withLock } = require("../../../src/utils/dbLock");

describe("dbLock.withLock", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("runs fn and reports acquired:true when GET_LOCK returns 1", async () => {
        db.__mockConnection.query
            .mockResolvedValueOnce([[{ acquired: 1 }]]) // GET_LOCK
            .mockResolvedValueOnce([{}]); // RELEASE_LOCK

        const fn = jest.fn().mockResolvedValue("done");
        const outcome = await withLock("nexora:job:test", fn);

        expect(outcome).toEqual({ acquired: true, result: "done" });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(db.__mockConnection.query).toHaveBeenNthCalledWith(
            1,
            "SELECT GET_LOCK(?, ?) AS acquired",
            ["nexora:job:test", 0]
        );
        expect(db.__mockConnection.query).toHaveBeenNthCalledWith(
            2,
            "SELECT RELEASE_LOCK(?)",
            ["nexora:job:test"]
        );
        // The connection must always be returned to the pool.
        expect(db.__mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it("skips fn and reports acquired:false when the lock is already held (GET_LOCK returns 0)", async () => {
        db.__mockConnection.query.mockResolvedValueOnce([[{ acquired: 0 }]]);

        const fn = jest.fn();
        const outcome = await withLock("nexora:job:test", fn);

        expect(outcome).toEqual({ acquired: false });
        expect(fn).not.toHaveBeenCalled();
        // No RELEASE_LOCK call - we never acquired it.
        expect(db.__mockConnection.query).toHaveBeenCalledTimes(1);
        expect(db.__mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it("still releases the lock and the connection when fn throws", async () => {
        db.__mockConnection.query
            .mockResolvedValueOnce([[{ acquired: 1 }]])
            .mockResolvedValueOnce([{}]); // RELEASE_LOCK

        const fn = jest.fn().mockRejectedValue(new Error("job blew up"));

        await expect(withLock("nexora:job:test", fn)).rejects.toThrow("job blew up");

        expect(db.__mockConnection.query).toHaveBeenNthCalledWith(
            2,
            "SELECT RELEASE_LOCK(?)",
            ["nexora:job:test"]
        );
        expect(db.__mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it("still releases the connection even if RELEASE_LOCK itself fails", async () => {
        db.__mockConnection.query
            .mockResolvedValueOnce([[{ acquired: 1 }]])
            .mockRejectedValueOnce(new Error("connection reset"));

        const fn = jest.fn().mockResolvedValue("done");
        const outcome = await withLock("nexora:job:test", fn);

        expect(outcome).toEqual({ acquired: true, result: "done" });
        expect(db.__mockConnection.release).toHaveBeenCalledTimes(1);
    });

    it("passes a custom waitSeconds through to GET_LOCK", async () => {
        db.__mockConnection.query
            .mockResolvedValueOnce([[{ acquired: 1 }]])
            .mockResolvedValueOnce([{}]);

        await withLock("nexora:job:test", jest.fn(), { waitSeconds: 5 });

        expect(db.__mockConnection.query).toHaveBeenNthCalledWith(
            1,
            "SELECT GET_LOCK(?, ?) AS acquired",
            ["nexora:job:test", 5]
        );
    });
});
