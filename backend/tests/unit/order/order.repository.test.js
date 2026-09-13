jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));

const db = require("../../../src/config/db");
const orderRepository = require("../../../src/modules/order/order.repository");

// C1 (remediation): findOrdersBySeller's wallet_credit_pending
// column is a hand-built EXISTS(...) + boolean expression, not something
// a mocked-repository unit test elsewhere would catch if the SQL itself
// were wrong (wrong placeholder order, wrong table alias, etc.) - this
// inspects the literal SQL and parameter array the way
// wallet.repository.test.js does for markItemsCredited.
describe("order.repository.findOrdersBySeller", () => {
    beforeEach(() => db.query.mockReset());

    it("passes sellerId three times (primary_item_name subquery, EXISTS subquery, then the outer JOIN) in that order", async () => {
        db.query.mockResolvedValue([[]]);

        await orderRepository.findOrdersBySeller(42);

        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];

        expect(sql).toContain("wallet_credit_pending");
        expect(sql).toContain("EXISTS");
        expect(sql).toContain("oi2.wallet_credited = FALSE");
        expect(sql).toContain("o.payment_method != 'cash_on_delivery'");
        expect(sql).toContain("INTERVAL 10 MINUTE");
        expect(sql).toContain("primary_item_name");
        expect(params).toEqual([42, 42, 42]);
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

    it("defaults to newest-first when no sort is given", async () => {
        db.query.mockResolvedValue([[]]);

        await orderRepository.findOrdersBySeller(42);

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.created_at DESC");
    });

    it("sorts by item name (nulls last) when sort=item_name", async () => {
        db.query.mockResolvedValue([[]]);

        await orderRepository.findOrdersBySeller(42, { sort: "item_name" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY primary_item_name IS NULL, primary_item_name ASC");
    });

    it("falls back to the default sort for an unrecognized sort value", async () => {
        db.query.mockResolvedValue([[]]);

        await orderRepository.findOrdersBySeller(42, { sort: "not-a-real-sort" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.created_at DESC");
    });
});

// getPrimaryItemSummary (Phase 6, UI/UX remediation) - backs the
// item-aware order_placed/order_cancelled/order_status_update
// notification copy in order.service.js. A single query, two correlated
// subqueries against order_items: the oldest line item's product name
// (ORDER BY oi.id ASC LIMIT 1, so "primary" means "first added", not
// highest-value) and a plain count of every line item on the order.
describe("order.repository.getPrimaryItemSummary", () => {
    beforeEach(() => db.query.mockReset());

    it("passes orderId twice (once per subquery) in a single query", async () => {
        db.query.mockResolvedValue([[{ itemName: "Widget", itemCount: 1 }]]);

        await orderRepository.getPrimaryItemSummary(7);

        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("order_items");
        expect(sql).toContain("ORDER BY oi.id ASC LIMIT 1");
        expect(params).toEqual([7, 7]);
    });

    it("returns the first item's name and the total item count", async () => {
        db.query.mockResolvedValue([[{ itemName: "Widget", itemCount: 3 }]]);

        const result = await orderRepository.getPrimaryItemSummary(7);

        expect(result).toEqual({ itemName: "Widget", itemCount: 3 });
    });

    it("falls back to null/0 if the driver somehow returns zero rows for this single-row scalar query", async () => {
        db.query.mockResolvedValue([[]]);

        const result = await orderRepository.getPrimaryItemSummary(7);

        expect(result).toEqual({ itemName: null, itemCount: 0 });
    });
});

describe("order.repository.findOrdersByBuyer sorting", () => {
    beforeEach(() => db.query.mockReset());

    it("defaults to newest-first when no sort is given", async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);

        await orderRepository.findOrdersByBuyer(7, {});

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.created_at DESC");
        expect(sql).toContain("primary_item_name");
    });

    it("sorts by amount (high to low) when sort=amount_high", async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);

        await orderRepository.findOrdersByBuyer(7, { sort: "amount_high" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.total_amount DESC");
    });

    it("sorts by status when sort=status", async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);

        await orderRepository.findOrdersByBuyer(7, { sort: "status" });

        const [sql] = db.query.mock.calls[0];
        expect(sql).toContain("ORDER BY o.status ASC, o.created_at DESC");
    });
});
