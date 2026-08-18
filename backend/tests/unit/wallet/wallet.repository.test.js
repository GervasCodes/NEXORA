jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");

// Phase 5 (Backend N+1 Fixes & Read Replica Adoption): markItemsCredited
// batches N per-item UPDATEs into one UPDATE using a CASE WHEN expression
// per varying column (commission_rate/commission_amount/seller_net_amount
// genuinely differ per item; wallet_credited/wallet_released don't - see
// the comment above markItemsCredited in wallet.repository.js). That's
// exactly the kind of hand-built SQL where a placeholder/parameter
// mismatch is an easy, silent mistake - wallet.service.test.js only
// verifies markItemsCredited was *called* with the right JS-level
// arguments (via a mocked wallet.repository), which wouldn't catch a bug
// in the actual query string this function builds. This test requires
// the repository directly (unmocked) and inspects the literal SQL and
// parameter array db.query received, so a misaligned CASE WHEN or a
// parameter in the wrong position would actually fail it.
describe("wallet.repository.markItemsCredited", () => {
    beforeEach(() => db.query.mockReset());

    it("does nothing (no query at all) for an empty item list", async () => {
        await walletRepository.markItemsCredited([], true);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("builds one CASE WHEN per item for each varying column, in item order, with a shared released value", async () => {
        db.query.mockResolvedValue([{}]);

        await walletRepository.markItemsCredited(
            [
                { id: 11, commissionRate: 10, commissionAmount: 100, netAmount: 900 },
                { id: 12, commissionRate: 12.5, commissionAmount: 62.5, netAmount: 437.5 }
            ],
            false
        );

        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];

        // Three CASE expressions (rate/amount/net), each with one WHEN
        // per item, plus a plain wallet_released = ? and a WHERE id IN
        // with one placeholder per item.
        expect(sql).toContain("commission_rate = CASE id WHEN ? THEN ? WHEN ? THEN ? END");
        expect(sql).toContain("commission_amount = CASE id WHEN ? THEN ? WHEN ? THEN ? END");
        expect(sql).toContain("seller_net_amount = CASE id WHEN ? THEN ? WHEN ? THEN ? END");
        expect(sql).toContain("wallet_credited = TRUE");
        expect(sql).toContain("wallet_released = ?");
        expect(sql).toContain("WHERE id IN (?, ?)");

        // Parameter order must exactly match the CASE clauses' left-to-right
        // appearance in the query: all rate pairs, then all amount pairs,
        // then all net pairs, then the shared released flag, then the id
        // list for WHERE IN - anything out of this order would silently
        // write the wrong value to the wrong column/row.
        expect(params).toEqual([
            11, 10, 12, 12.5, // commission_rate CASE
            11, 100, 12, 62.5, // commission_amount CASE
            11, 900, 12, 437.5, // seller_net_amount CASE
            false, // wallet_released
            11, 12 // WHERE id IN
        ]);
    });

    it("handles a single item correctly (CASE with exactly one WHEN, not a special-cased plain UPDATE)", async () => {
        db.query.mockResolvedValue([{}]);

        await walletRepository.markItemsCredited(
            [{ id: 5, commissionRate: 10, commissionAmount: 50, netAmount: 450 }],
            true
        );

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("commission_rate = CASE id WHEN ? THEN ? END");
        expect(sql).toContain("WHERE id IN (?)");
        expect(params).toEqual([5, 10, 5, 50, 5, 450, true, 5]);
    });

    it("runs on a provided transaction connection, not the default pool, when one is passed", async () => {
        const connection = { query: jest.fn().mockResolvedValue([{}]) };

        await walletRepository.markItemsCredited(
            [{ id: 1, commissionRate: 10, commissionAmount: 10, netAmount: 90 }],
            false,
            connection
        );

        expect(connection.query).toHaveBeenCalledTimes(1);
        expect(db.query).not.toHaveBeenCalled();
    });
});
