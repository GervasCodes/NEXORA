// Real-database concurrency tests (Phase 15).
//
// Each test fires two requests at the same time and asserts the money or
// stock outcome, not just that both calls returned. These only mean
// something against real MySQL row locks, so nothing here mocks the pool.
//
// Covered: wallet order payment, checkout double-submit, cancel vs the
// stale-order job. Booking cancel, coupon redemption and group buy claim
// are not covered here; they need fixtures this helper file doesn't have yet.

jest.mock("../../src/modules/notification/notification.service");
jest.mock("../../src/modules/fraud/fraud.service");
jest.mock("../../src/modules/audit/audit.service");
jest.mock("../../src/socket/socket", () => ({ emitToAdmins: jest.fn() }), { virtual: true });

const notificationService = require("../../src/modules/notification/notification.service");
const fraudService = require("../../src/modules/fraud/fraud.service");
const db = require("../../src/config/db");
const orderService = require("../../src/modules/order/order.service");
const buyerWalletService = require("../../src/modules/buyerWallet/buyerWallet.service");
const fixtures = require("./helpers/dbFixtures");

const shippingInfo = () => ({
    payment_method: "mobile_money",
    shipping_address: "123 Test St",
    shipping_city: "Dar es Salaam",
    shipping_region: "Dar es Salaam",
    shipping_phone: "+255700000000"
});

// allSettled so one rejected side doesn't hide the other's outcome.
const race = (fn) => Promise.allSettled([fn(), fn()]);
const countFulfilled = (results) => results.filter((r) => r.status === "fulfilled").length;

beforeEach(async () => {
    await fixtures.resetTables();
    notificationService.notify.mockResolvedValue(undefined);
    fraudService.evaluateOrder.mockResolvedValue(undefined);
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("concurrency (real database)", () => {
    it("wallet order payment: two simultaneous debits for a 100 balance of 80 each - exactly one succeeds and balance never goes negative", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        await db.query("INSERT INTO buyer_wallets (buyer_id, balance) VALUES (?, 100)", [buyer.id]);

        const order = await fixtures.createOrder(buyer.id, { total_amount: 80 });

        const results = await race(() =>
            buyerWalletService.debitForOrder(buyer.id, 80, order.id, null)
        );

        expect(countFulfilled(results)).toBe(1);
        const [[wallet]] = await db.query("SELECT balance FROM buyer_wallets WHERE buyer_id = ?", [buyer.id]);
        expect(Number(wallet.balance)).toBe(20);

        const [txns] = await db.query(
            "SELECT id FROM buyer_wallet_transactions WHERE buyer_id = ? AND type = 'debit'",
            [buyer.id]
        );
        expect(txns).toHaveLength(1);
    });

    it("checkout double-submit: the same cart checked out twice at once creates one order and decrements stock once", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 5000, stock: 10 });
        await fixtures.createCartItem(buyer.id, product.id, 2);

        const results = await race(() => orderService.checkout(buyer.id, shippingInfo()));

        expect(countFulfilled(results)).toBe(1);

        const [[orders]] = await db.query(
            "SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ?",
            [buyer.id]
        );
        expect(Number(orders.n)).toBe(1);

        const [[productRow]] = await db.query("SELECT stock FROM products WHERE id = ?", [product.id]);
        expect(productRow.stock).toBe(8); // 10 - 2, once
    });

    it("cancel vs stale-order job: a buyer cancel and the stale sweep racing on one pending order restock exactly once", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 5000, stock: 3 });

        // Unpaid pending order: stock was already reserved at checkout (3 left after buying 2 of 5).
        const order = await fixtures.createOrder(buyer.id, {
            status: "pending",
            payment_status: "unpaid",
            total_amount: 10000
        });
        await fixtures.createOrderItem(order.id, product.id, seller.id, { quantity: 2, unit_price: 5000, subtotal: 10000 });

        const [[staleRow]] = await db.query("SELECT * FROM orders WHERE id = ?", [order.id]);

        await Promise.allSettled([
            orderService.cancelOrder(order.id, buyer.id),
            orderService.autoCancelStaleOrder(staleRow)
        ]);

        const [[orderRow]] = await db.query("SELECT status FROM orders WHERE id = ?", [order.id]);
        expect(orderRow.status).toBe("cancelled");

        const [[productRow]] = await db.query("SELECT stock FROM products WHERE id = ?", [product.id]);
        expect(productRow.stock).toBe(5); // 3 + 2 restored once, not twice
    });
});
