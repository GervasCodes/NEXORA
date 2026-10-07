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

// Cancel a paid order (Phase 3, P0) - conditional status flips. The real
// safety here is the SQL shape itself (status IN (...) in the WHERE
// clause, affectedRows as the return value) - see order.service.js's
// cancelOrder/autoCancelStaleOrder for how the boolean/count return is
// used to gate stock restoration and the refund/reversal flow.
describe("order.repository.cancelOrderIfCancellable / cancelChildOrdersIfCancellable", () => {
    beforeEach(() => db.query.mockReset());

    it("cancelOrderIfCancellable returns true only when a row actually changed", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await expect(orderRepository.cancelOrderIfCancellable(1, ["pending", "processing"])).resolves.toBe(true);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("UPDATE orders SET status = 'cancelled'");
        expect(sql).toContain("status IN (?)");
        expect(params).toEqual([1, ["pending", "processing"]]);

        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        await expect(orderRepository.cancelOrderIfCancellable(1, ["pending", "processing"])).resolves.toBe(false);
    });

    it("cancelChildOrdersIfCancellable returns the number of children actually changed", async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 2 }]);
        await expect(orderRepository.cancelChildOrdersIfCancellable(1, ["pending", "processing"])).resolves.toBe(2);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("WHERE parent_order_id = ? AND status IN (?)");
        expect(params).toEqual([1, ["pending", "processing"]]);
    });
});

// Checkout idempotency (Phase 3, P1) - createOrder/createSplitOrder lock
// exactly the cart rows the checkout was quoted against before writing
// anything, so a double-submit / retried request can't create a second
// order from the same cart. Both paths covered here only need the lock
// query's result mocked, since a mismatch is rejected before any further
// query runs (the order row is never inserted) - see
// order.repository.js#lockAndValidateCartRows.
describe("order.repository.createOrder - checkout idempotency (Phase 3)", () => {
    beforeEach(() => {
        db.query.mockReset();
        db.getConnection.mockClear();
        const conn = db.__mockConnection;
        conn.beginTransaction.mockClear();
        conn.commit.mockClear();
        conn.rollback.mockClear();
        conn.release.mockClear();
        conn.query.mockReset();
    });

    const cartItems = [{ cart_item_id: 101, product_id: 1, quantity: 2, unit_price: 1000, subtotal: 2000, seller_id: 10 }];

    it("locks the cart rows this checkout was quoted against with FOR UPDATE", async () => {
        const conn = db.__mockConnection;
        // Lock query returns a row matching what was quoted - this test
        // only cares that the lock query itself ran correctly, so a
        // second call failing isn't an issue: the surrounding try/catch
        // in createOrder rolls back and the thrown error is asserted on
        // instead of needing the rest of the insert chain mocked too.
        conn.query.mockResolvedValueOnce([[{ id: 101, quantity: 2 }]]);

        await orderRepository.createOrder(5, "ORD-1", {}, cartItems, 2000).catch(() => {});

        const [sql, params] = conn.query.mock.calls[0];
        expect(sql).toContain("SELECT id, quantity FROM cart_items WHERE id IN (?)");
        expect(sql).toContain("FOR UPDATE");
        expect(params).toEqual([[101]]);
        expect(conn.beginTransaction).toHaveBeenCalled();
    });

    it("rejects and rolls back when a locked cart row's quantity no longer matches what was quoted", async () => {
        const conn = db.__mockConnection;
        // Stock changed (or a double-submit already consumed this cart
        // row) between quoting and this checkout attempt actually running.
        conn.query.mockResolvedValueOnce([[{ id: 101, quantity: 5 }]]);

        await expect(orderRepository.createOrder(5, "ORD-1", {}, cartItems, 2000))
            .rejects.toThrow("Your cart changed - please review it and try again");

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    it("rejects when a locked cart row is missing entirely (already consumed by another checkout)", async () => {
        const conn = db.__mockConnection;
        conn.query.mockResolvedValueOnce([[]]); // the row is gone

        await expect(orderRepository.createOrder(5, "ORD-1", {}, cartItems, 2000))
            .rejects.toThrow("Your cart changed - please review it and try again");

        expect(conn.rollback).toHaveBeenCalled();
    });

    it("skips the cart lock entirely for cart items with no cart_item_id (the groupBuy.service.js#claim path)", async () => {
        const conn = db.__mockConnection;
        // insertOrderRow's INSERT, then insertOrderItems' query/queries -
        // not the focus of this test, just needs to resolve so the
        // transaction can reach commit. Any shape of resolved value with
        // an insertId works for insertOrderRow; subsequent calls default
        // to undefined results which insertOrderItems is expected to
        // handle for a single-item array in whatever shape it uses.
        conn.query.mockResolvedValue([{ insertId: 1 }]);

        const groupBuyLineItem = [{ product_id: 1, seller_id: 10, quantity: 1, unit_price: 5000, subtotal: 5000 }];

        await orderRepository.createOrder(5, "GRP-1", {}, groupBuyLineItem, 5000).catch(() => {});

        // No "WHERE id IN" cart lock query at all among the calls made -
        // the very first call is straight to insertOrderRow's INSERT.
        const lockCalls = conn.query.mock.calls.filter(([sql]) => sql.includes("FOR UPDATE"));
        expect(lockCalls).toHaveLength(0);
    });
});
