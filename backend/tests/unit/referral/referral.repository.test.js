jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const referralRepository = require("../../../src/modules/referral/referral.repository");

// Coupon and points integrity (Phase 3, P0). addPoints previously did a
// single unconditional `loyalty_points += points` for every call,
// earn or redeem alike - two concurrent checkouts both redeeming points
// for the same buyer could each pass whatever balance check ran before
// this (quoteRedemption), then both apply here, driving the balance
// negative. The fix: a redemption (points < 0) only succeeds while the
// balance can actually cover it, checked in the same UPDATE statement
// that applies it.
describe("referral.repository.addPoints", () => {
    beforeEach(() => db.query.mockReset());

    it("redemption (negative points): guards against the balance going negative, in one statement", async () => {
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // conditional UPDATE
            .mockResolvedValueOnce([[{ loyalty_points: 60 }]]) // SELECT balance after
            .mockResolvedValueOnce([{ insertId: 1 }]); // ledger INSERT

        const balanceAfter = await referralRepository.addPoints(5, -40, "redeemed", { orderId: 1 });

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("loyalty_points = loyalty_points + ?");
        expect(sql).toContain("loyalty_points >= ?");
        expect(params).toEqual([-40, 5, 40]);
        expect(balanceAfter).toBe(60);
    });

    it("redemption: throws when the balance can't cover it (the conditional UPDATE affects no rows)", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(referralRepository.addPoints(5, -40, "redeemed", { orderId: 1 }))
            .rejects.toThrow("Your loyalty points balance changed - please try again");

        // Never reads a balance or writes a ledger entry for a redemption
        // that didn't actually happen.
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it("earning or giving back points (non-negative): unconditional add, no balance guard needed", async () => {
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ loyalty_points: 100 }]])
            .mockResolvedValueOnce([{ insertId: 1 }]);

        await referralRepository.addPoints(5, 40, "reversed", { orderId: 1, description: "Order #1 cancelled - points returned" });

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toBe("UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?");
        expect(params).toEqual([40, 5]);
    });
});
