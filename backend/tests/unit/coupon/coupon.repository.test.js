jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const couponRepository = require("../../../src/modules/coupon/coupon.repository");

// Coupon and points integrity (Phase 3, P0). recordRedemption previously
// did an unconditional `times_redeemed += 1` then a plain INSERT with no
// DB-level uniqueness behind it - two concurrent checkouts redeeming the
// same coupon as the same buyer, or redeeming the very last slot of a
// limited coupon, could both "succeed". The fix is two guards: a
// conditional UPDATE that only succeeds while there's still redemption
// headroom, and migration 121's uq_coupon_redemptions_user unique key
// (exercised here via a simulated ER_DUP_ENTRY, since the real constraint
// only exists in a real database).
describe("coupon.repository.recordRedemption", () => {
    beforeEach(() => db.query.mockReset());

    it("increments times_redeemed conditionally, guarding against exceeding max_redemptions", async () => {
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE coupons
            .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT coupon_redemptions

        await couponRepository.recordRedemption(9, 5, 1, 500);

        const [updateSql, updateParams] = db.query.mock.calls[0];
        expect(updateSql).toContain("times_redeemed = times_redeemed + 1");
        expect(updateSql).toContain("max_redemptions IS NULL OR times_redeemed < max_redemptions");
        expect(updateParams).toEqual([9]);
    });

    it("rejects when the conditional UPDATE affects no rows (redemption limit already reached)", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(couponRepository.recordRedemption(9, 5, 1, 500))
            .rejects.toThrow("This code has just reached its redemption limit - please try again without it");

        // Never attempts the INSERT once the counter guard itself failed.
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it("rolls back the counter increment and reports a friendly error on a uq_coupon_redemptions_user race loss", async () => {
        const dupError = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062 });
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE coupons succeeded...
            .mockRejectedValueOnce(dupError) // ...but another concurrent request won the INSERT race
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // rollback: times_redeemed - 1

        await expect(couponRepository.recordRedemption(9, 5, 1, 500))
            .rejects.toThrow("You've already used this code");

        const [rollbackSql, rollbackParams] = db.query.mock.calls[2];
        expect(rollbackSql).toContain("times_redeemed = times_redeemed - 1");
        expect(rollbackParams).toEqual([9]);
    });

    it("re-throws a non-duplicate-key error without attempting the rollback", async () => {
        const otherError = new Error("connection lost");
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockRejectedValueOnce(otherError);

        await expect(couponRepository.recordRedemption(9, 5, 1, 500)).rejects.toThrow("connection lost");
        expect(db.query).toHaveBeenCalledTimes(2);
    });
});

// Reverse points and coupon on cancel and on stale expiry (Phase 3).
describe("coupon.repository.reverseRedemption", () => {
    beforeEach(() => db.query.mockReset());

    it("deletes the redemption row and decrements times_redeemed (floored at zero) for this order", async () => {
        db.query
            .mockResolvedValueOnce([[{ coupon_id: 9 }]]) // SELECT coupon_id
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE GREATEST(...)

        await couponRepository.reverseRedemption(1);

        expect(db.query).toHaveBeenNthCalledWith(2, "DELETE FROM coupon_redemptions WHERE order_id = ?", [1]);
        const [updateSql, updateParams] = db.query.mock.calls[2];
        expect(updateSql).toContain("GREATEST(times_redeemed - 1, 0)");
        expect(updateParams).toEqual([9]);
    });

    it("is a no-op when this order never redeemed a coupon", async () => {
        db.query.mockResolvedValueOnce([[]]);

        await couponRepository.reverseRedemption(1);

        expect(db.query).toHaveBeenCalledTimes(1);
    });
});
