jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const creditRepository = require("../../../src/modules/sponsorshipCredit/sponsorshipCredit.repository");

const connection = db.__mockConnection;

beforeEach(() => {
    jest.clearAllMocks();
});

// These pin the two SQL properties the money-safety of the credit
// allotment rests on, since the services only ever see them through a
// mocked repository.
describe("sponsorshipCredit.repository.insertPeriodIfAbsent", () => {
    it("is idempotent per subscription, so a replayed activation can never grant twice", async () => {
        connection.query.mockResolvedValue([{}]);

        await creditRepository.insertPeriodIfAbsent({
            sellerId: 10, subscriptionId: 5, creditsGranted: 3,
            periodStart: "2026-09-01", periodEnd: "2026-10-01"
        }, connection);

        const [sql, params] = connection.query.mock.calls[0];
        expect(sql).toMatch(/ON DUPLICATE KEY UPDATE subscription_id = subscription_id/);
        expect(params).toEqual([10, 5, 3, "2026-09-01", "2026-10-01"]);
    });
});

describe("sponsorshipCredit.repository.incrementUsed", () => {
    it("only applies while the new total still fits inside the grant, and reports whether it did", async () => {
        connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await expect(creditRepository.incrementUsed(3, 4, connection)).resolves.toBe(true);

        const [sql, params] = connection.query.mock.calls[0];
        expect(sql).toMatch(/credits_used \+ \? <= credits_granted/);
        expect(params).toEqual([4, 3, 4]);

        connection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        await expect(creditRepository.incrementUsed(3, 4, connection)).resolves.toBe(false);
    });
});

describe("sponsorshipCredit.repository.findCurrentPeriodId", () => {
    it("only considers periods whose subscription is active and still in period, newest first", async () => {
        db.query.mockResolvedValueOnce([[{ id: 7 }]]);

        await expect(creditRepository.findCurrentPeriodId(10)).resolves.toBe(7);

        const [sql] = db.query.mock.calls[0];
        expect(sql).toMatch(/ss\.status = 'active'/);
        expect(sql).toMatch(/current_period_end >= NOW\(\)/);
        expect(sql).toMatch(/ORDER BY cp\.period_start DESC/);
    });

    it("returns null when the seller has no current period", async () => {
        db.query.mockResolvedValueOnce([[]]);

        await expect(creditRepository.findCurrentPeriodId(10)).resolves.toBeNull();
    });
});
