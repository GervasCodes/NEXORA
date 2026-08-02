jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const replayGuard = require("../../../src/utils/webhookReplayGuard");

describe("webhookReplayGuard.isTimestampFresh", () => {
    it("treats a missing timestamp as fresh (nothing to check - hash dedup is the only guard)", () => {
        expect(replayGuard.isTimestampFresh(undefined)).toBe(true);
        expect(replayGuard.isTimestampFresh(null)).toBe(true);
        expect(replayGuard.isTimestampFresh("")).toBe(true);
    });

    it("accepts a current unix-seconds timestamp", () => {
        expect(replayGuard.isTimestampFresh(Math.floor(Date.now() / 1000))).toBe(true);
    });

    it("accepts a current unix-milliseconds timestamp", () => {
        expect(replayGuard.isTimestampFresh(Date.now())).toBe(true);
    });

    it("accepts MalipoPay's documented yyyyMMddHHmmss format for the current moment", () => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const compact = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
        expect(replayGuard.isTimestampFresh(compact)).toBe(true);
    });

    it("rejects a timestamp far in the past (stale/replayed)", () => {
        const tenMinutesAgo = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);
        expect(replayGuard.isTimestampFresh(tenMinutesAgo)).toBe(false);
    });

    it("rejects a timestamp far in the future", () => {
        const tenMinutesFromNow = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
        expect(replayGuard.isTimestampFresh(tenMinutesFromNow)).toBe(false);
    });

    it("treats an unparsable timestamp as NOT fresh (fails closed, not open)", () => {
        expect(replayGuard.isTimestampFresh("not-a-real-timestamp")).toBe(false);
    });
});

describe("webhookReplayGuard.recordDelivery", () => {
    it("returns true (fresh delivery) when the insert succeeds", async () => {
        db.query.mockResolvedValueOnce([{ insertId: 1 }]);
        const result = await replayGuard.recordDelivery("malipopay", "same bytes");
        expect(result).toBe(true);
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO webhook_replay_guard"),
            expect.arrayContaining(["malipopay", expect.any(String)])
        );
    });

    it("returns false (replay) when the insert hits the unique-constraint duplicate error", async () => {
        const dupError = new Error("Duplicate entry");
        dupError.code = "ER_DUP_ENTRY";
        db.query.mockRejectedValueOnce(dupError);

        const result = await replayGuard.recordDelivery("selcom", "same bytes");
        expect(result).toBe(false);
    });

    it("re-throws a non-duplicate database error rather than treating it as a replay", async () => {
        db.query.mockRejectedValueOnce(new Error("connection lost"));
        await expect(replayGuard.recordDelivery("snippe", "bytes")).rejects.toThrow("connection lost");
    });

    it("produces a different hash for different payloads (so distinct deliveries never collide)", async () => {
        db.query.mockResolvedValueOnce([{ insertId: 1 }]);
        await replayGuard.recordDelivery("malipopay", "payload A");
        const [, paramsA] = db.query.mock.calls[0];

        db.query.mockResolvedValueOnce([{ insertId: 2 }]);
        await replayGuard.recordDelivery("malipopay", "payload B");
        const [, paramsB] = db.query.mock.calls[1];

        expect(paramsA[1]).not.toBe(paramsB[1]);
    });

    it("produces the same hash for the exact same (provider, payload) pair - the core replay-detection property", async () => {
        db.query.mockResolvedValueOnce([{ insertId: 1 }]);
        await replayGuard.recordDelivery("malipopay", "identical payload");
        const [, paramsA] = db.query.mock.calls[0];

        db.query.mockResolvedValueOnce([{ insertId: 2 }]);
        await replayGuard.recordDelivery("malipopay", "identical payload");
        const [, paramsB] = db.query.mock.calls[1];

        expect(paramsA[1]).toBe(paramsB[1]);
    });
});
