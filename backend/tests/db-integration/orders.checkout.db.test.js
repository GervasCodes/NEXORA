// Real-database integration tests for order.service.js's checkout flow.
//
// order.service.checkout() also calls out to notification.service (which
// itself would email via config/brevo), fraud.service (fire-and-forget
// risk scoring), audit.service (writes audit_logs), and the socket layer
// (admin dashboard live-update push) - none of those are what this suite
// exists to catch (see jest.db.config.js's header comment: typo'd
// columns, broken joins, transactions that don't roll back). They're
// mocked here, same as fraud.service is mocked in
// wallet.requestWithdrawal.db.test.js, so this suite stays focused on
// cart_items/orders/order_items/products - the tables order.repository.js
// actually writes to inside its transaction.
jest.mock("../../src/modules/notification/notification.service");
jest.mock("../../src/modules/fraud/fraud.service");
jest.mock("../../src/modules/audit/audit.service");
jest.mock("../../src/socket/socket", () => ({ emitToAdmins: jest.fn() }), { virtual: true });

const notificationService = require("../../src/modules/notification/notification.service");
const fraudService = require("../../src/modules/fraud/fraud.service");

const db = require("../../src/config/db");
const orderService = require("../../src/modules/order/order.service");
const fixtures = require("./helpers/dbFixtures");

const shippingInfo = (overrides = {}) => ({
    payment_method: "mobile_money",
    shipping_address: "123 Test St",
    shipping_city: "Dar es Salaam",
    shipping_region: "Dar es Salaam",
    shipping_phone: "+255700000000",
    ...overrides
});

beforeEach(async () => {
    await fixtures.resetTables();
    notificationService.notify.mockResolvedValue(undefined);
    fraudService.evaluateOrder.mockResolvedValue(undefined);
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("order.service.checkout (real database)", () => {
    it("single-vendor cart: creates one order + its order_items, decrements stock, and empties the cart", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 5000, stock: 10 });
        await fixtures.createCartItem(buyer.id, product.id, 2);

        const result = await orderService.checkout(buyer.id, shippingInfo());

        expect(result.isMultiVendor).toBe(false);
        expect(result.totalAmount).toBe(10000);

        const [[order]] = await db.query("SELECT * FROM orders WHERE id = ?", [result.orderId]);
        expect(order).toEqual(
            expect.objectContaining({ buyer_id: buyer.id, is_parent: 0, status: "pending", payment_status: "unpaid" })
        );
        expect(Number(order.total_amount)).toBe(10000);

        const [items] = await db.query("SELECT * FROM order_items WHERE order_id = ?", [result.orderId]);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(expect.objectContaining({ product_id: product.id, seller_id: seller.id, quantity: 2 }));

        const [[productRow]] = await db.query("SELECT stock FROM products WHERE id = ?", [product.id]);
        expect(productRow.stock).toBe(8); // 10 - 2

        const [cartRows] = await db.query("SELECT * FROM cart_items WHERE user_id = ?", [buyer.id]);
        expect(cartRows).toHaveLength(0); // cart cleared on checkout
    });

    it("multi-vendor cart: creates one parent order and one child order per seller, each with its own items", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const sellerA = await fixtures.createUser({ role: "seller" });
        const sellerB = await fixtures.createUser({ role: "seller" });
        const productA = await fixtures.createProduct(sellerA.id, { price: 3000, stock: 5 });
        const productB = await fixtures.createProduct(sellerB.id, { price: 7000, stock: 5 });
        await fixtures.createCartItem(buyer.id, productA.id, 1);
        await fixtures.createCartItem(buyer.id, productB.id, 1);

        const result = await orderService.checkout(buyer.id, shippingInfo());

        expect(result.isMultiVendor).toBe(true);
        expect(result.vendorCount).toBe(2);
        expect(result.totalAmount).toBe(10000);

        const [[parent]] = await db.query("SELECT * FROM orders WHERE id = ?", [result.orderId]);
        expect(parent.is_parent).toBe(1);

        const [children] = await db.query(
            "SELECT * FROM orders WHERE parent_order_id = ? ORDER BY id", [result.orderId]
        );
        expect(children).toHaveLength(2);

        for (const child of children) {
            const [items] = await db.query("SELECT * FROM order_items WHERE order_id = ?", [child.id]);
            expect(items).toHaveLength(1);
        }

        // Parent order itself has no line items of its own (see
        // order.repository.js comment: only child orders hold items).
        const [parentItems] = await db.query("SELECT * FROM order_items WHERE order_id = ?", [result.orderId]);
        expect(parentItems).toHaveLength(0);
    });

    it("rejects checkout with insufficient stock and rolls back the whole transaction (no order, no stock change)", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000, stock: 1 });
        await fixtures.createCartItem(buyer.id, product.id, 5); // more than the 1 in stock

        await expect(orderService.checkout(buyer.id, shippingInfo())).rejects.toThrow(/stock/i);

        const [orders] = await db.query("SELECT * FROM orders WHERE buyer_id = ?", [buyer.id]);
        expect(orders).toHaveLength(0);

        const [[productRow]] = await db.query("SELECT stock FROM products WHERE id = ?", [product.id]);
        expect(productRow.stock).toBe(1); // unchanged - rolled back

        const [cartRows] = await db.query("SELECT * FROM cart_items WHERE user_id = ?", [buyer.id]);
        expect(cartRows).toHaveLength(1); // cart not cleared on a rolled-back checkout
    });

    it("rejects checkout with an empty cart before touching the database", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });

        await expect(orderService.checkout(buyer.id, shippingInfo())).rejects.toThrow("Your cart is empty");
    });
});

describe("order.service.cancelOrder (real database)", () => {
    it("cancels a cancellable single order and updates its real status column", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const order = await fixtures.createOrder(buyer.id, { status: "pending" });

        await orderService.cancelOrder(order.id, buyer.id);

        const [[row]] = await db.query("SELECT status FROM orders WHERE id = ?", [order.id]);
        expect(row.status).toBe("cancelled");
        expect(notificationService.notify).toHaveBeenCalledTimes(1);
    });

    it("rejects cancelling an order that belongs to a different buyer, and leaves its status untouched", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const otherBuyer = await fixtures.createUser({ role: "buyer" });
        const order = await fixtures.createOrder(buyer.id, { status: "pending" });

        await expect(orderService.cancelOrder(order.id, otherBuyer.id)).rejects.toThrow("Order not found");

        const [[row]] = await db.query("SELECT status FROM orders WHERE id = ?", [order.id]);
        expect(row.status).toBe("pending");
    });

    it("rejects cancelling an order that's already past the cancellable window", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const order = await fixtures.createOrder(buyer.id, { status: "delivered" });

        await expect(orderService.cancelOrder(order.id, buyer.id)).rejects.toThrow(/can no longer be cancelled/i);

        const [[row]] = await db.query("SELECT status FROM orders WHERE id = ?", [order.id]);
        expect(row.status).toBe("delivered");
    });
});
