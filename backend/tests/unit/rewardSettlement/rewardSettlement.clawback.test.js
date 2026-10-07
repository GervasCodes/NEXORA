// Points clawback on cancel or refund (Phase 6, item 11).
//
// Calls the exported reverseOrder directly, so the test covers the
// transaction logic (clamp, idempotency, child orders) without running the
// hourly job.

jest.mock("../../../src/config/db", () => {
    const connection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    return { getConnection: jest.fn(async () => connection), query: jest.fn(), __connection: connection };
});
jest.mock("../../../src/modules/settings/settings.service", () => ({}));
jest.mock("../../../src/modules/affiliate/affiliate.service", () => ({
    releaseConversionOn: jest.fn(),
    reverseConversionOn: jest.fn().mockResolvedValue(true)
}));
jest.mock("../../../src/modules/referral/referral.service", () => ({
    pointsForAmount: jest.fn(),
    REFERRAL_MIN_FIRST_ORDER_TZS: 20000,
    REFERRAL_BONUS_POINTS: 100
}));
jest.mock("../../../src/modules/referral/referral.repository", () => ({
    addPoints: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../../../src/modules/notification/notification.service", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/config/sentry", () => ({ captureException: jest.fn() }));
jest.mock("../../../src/utils/logger", () => ({
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));

const db = require("../../../src/config/db");
const referralRepository = require("../../../src/modules/referral/referral.repository");
const affiliateService = require("../../../src/modules/affiliate/affiliate.service");
const { reverseOrder } = require("../../../src/modules/rewardSettlement/rewardSettlement.service");

const connection = db.__connection;

// Routes each SQL statement to a canned result, so the test reads as a
// description of the database state rather than call-order bookkeeping.
const setDb = ({ balance = 1000, openConversions = [] } = {}) => {
    connection.query.mockImplementation(async (sql) => {
        if (sql.includes("FROM affiliate_conversions")) return [openConversions];
        if (sql.includes("SELECT loyalty_points FROM users")) return [[{ loyalty_points: balance }]];
        if (sql.includes("UPDATE orders SET loyalty_clawed_back_at")) return [{ affectedRows: 1 }];
        return [{ affectedRows: 0 }];
    });
};

const order = (overrides = {}) => ({
    id: 42,
    buyer_id: 7,
    parent_order_id: null,
    loyalty_points_earned: 300,
    loyalty_clawed_back_at: null,
    ...overrides
});

beforeEach(() => jest.clearAllMocks());

describe("loyalty points clawback", () => {
    it("takes back everything earned when the buyer still holds the points", async () => {
        setDb({ balance: 1000 });

        await reverseOrder(order());

        expect(referralRepository.addPoints).toHaveBeenCalledWith(
            7, -300, "reversed", expect.objectContaining({ orderId: 42 }), connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("clamps the clawback to the buyer's balance when points were already spent", async () => {
        setDb({ balance: 120 });

        await reverseOrder(order());

        expect(referralRepository.addPoints).toHaveBeenCalledWith(
            7, -120, "reversed", expect.any(Object), connection
        );
    });

    it("never drives the balance negative when nothing is left to take back", async () => {
        setDb({ balance: 0 });

        await reverseOrder(order());

        expect(referralRepository.addPoints).not.toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalled();
    });

    it("does not claw back twice when the order is already clawed back", async () => {
        setDb({ balance: 1000 });

        await reverseOrder(order({ loyalty_clawed_back_at: new Date() }));

        expect(referralRepository.addPoints).not.toHaveBeenCalled();
        const sqls = connection.query.mock.calls.map(([sql]) => sql);
        expect(sqls.some((sql) => sql.includes("loyalty_clawed_back_at = NOW()"))).toBe(false);
    });

    it("never claws back points on a vendor child of a split order", async () => {
        setDb({ balance: 1000 });

        await reverseOrder(order({ parent_order_id: 41 }));

        expect(referralRepository.addPoints).not.toHaveBeenCalled();
    });

    it("reverses open affiliate commissions in the same transaction", async () => {
        setDb({ balance: 1000, openConversions: [{ id: 3 }, { id: 4 }] });

        await reverseOrder(order());

        expect(affiliateService.reverseConversionOn).toHaveBeenCalledWith(3, connection);
        expect(affiliateService.reverseConversionOn).toHaveBeenCalledWith(4, connection);
    });
});
