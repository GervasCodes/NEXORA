jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const orderRepository = require("../../../src/modules/order/order.repository");

// C1 (Phase 4 remediation): findOrdersBySeller's wallet_credit_pending
// column is a hand-built EXISTS(...) + boolean expression, not something
// a mocked-repository unit test elsewhere would catch if the SQL itself
// were wrong (wrong placeholder order, wrong table alias, etc.) - this
// inspects the literal SQL and parameter array the way
// wallet.repository.test.js does for markItemsCredited.
describe("order.repository.findOrdersBySeller", () => {
    beforeEach(() => db.query.mockReset());

    it("passes sellerId twice (EXISTS subquery, then the outer JOIN) in that order", async () => {
        db.query.mockResolvedValue([[]]);

        await orderRepository.findOrdersBySeller(42);

        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];

        expect(sql).toContain("wallet_credit_pending");
        expect(sql).toContain("EXISTS");
        expect(sql).toContain("oi2.wallet_credited = FALSE");
        expect(sql).toContain("o.payment_method != 'cash_on_delivery'");
        expect(sql).toContain("INTERVAL 10 MINUTE");
        expect(params).toEqual([42, 42]);
    });

    it("coerces the DB's 0/1 EXISTS result into a real boolean", async () => {
        db.query.mockResolvedValue([[
            { id: 1, order_number: "ORD-1", wallet_credit_pending: 1 },
            { id: 2, order_number: "ORD-2", wallet_credit_pending: 0 }
        ]]);

        const rows = await orderRepository.findOrdersBySeller(42);

        expect(rows[0].wallet_credit_pending).toBe(true);
        expect(rows[1].wallet_credit_pending).toBe(false);
    });
});
