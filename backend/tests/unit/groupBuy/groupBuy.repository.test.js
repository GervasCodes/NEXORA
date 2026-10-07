jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const groupBuyRepository = require("../../../src/modules/groupBuy/groupBuy.repository");

// Group buys: "lock the claim so a double tap can't create two orders"
// (Phase 3). group_buy_participants.order_id is a real FK to orders(id),
// so it can't double as a pre-order-creation lock sentinel - claim_locked_at
// (migration 121) is the atomic compare-and-swap instead: only succeeds
// while order_id is still NULL and no other claim is currently in flight
// (NULL, or stale past 5 minutes - self-heals a crash mid-claim).
describe("groupBuy.repository.lockClaim / releaseClaimLock", () => {
    beforeEach(() => db.query.mockReset());

    it("lockClaim succeeds only while order_id is NULL and no other claim is in flight (or it's stale)", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await expect(groupBuyRepository.lockClaim(7, 5)).resolves.toBe(true);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("SET claim_locked_at = NOW()");
        expect(sql).toContain("order_id IS NULL");
        expect(sql).toContain("claim_locked_at IS NULL OR claim_locked_at < (NOW() - INTERVAL 5 MINUTE)");
        expect(params).toEqual([7, 5]);
    });

    it("lockClaim fails when a double-tap claim is already in flight for this participant", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(groupBuyRepository.lockClaim(7, 5)).resolves.toBe(false);
    });

    it("releaseClaimLock frees the lock so a failed order-creation attempt can be retried immediately", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await groupBuyRepository.releaseClaimLock(7, 5);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("SET claim_locked_at = NULL");
        expect(sql).toContain("WHERE group_buy_id = ? AND buyer_id = ? AND order_id IS NULL");
        expect(params).toEqual([7, 5]);
    });
});
