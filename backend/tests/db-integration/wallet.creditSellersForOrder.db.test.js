// Real-database counterpart to tests/unit/wallet/wallet.service.test.js.
// That suite mocks wallet.repository entirely, so it can't catch a
// typo'd column name, a broken JOIN, or a transaction that doesn't
// actually roll back. This file runs the same scenarios against a real
// MySQL instance with migrations applied - see docker-compose.test.yml
// and `npm run test:db`.

jest.mock("../../src/modules/settings/settings.service");
jest.mock("../../src/modules/notification/notification.service");
jest.mock("../../src/modules/fraud/fraud.service");

const settingsService = require("../../src/modules/settings/settings.service");
const notificationService = require("../../src/modules/notification/notification.service");

const db = require("../../src/config/db");
const walletService = require("../../src/modules/wallet/wallet.service");
const fixtures = require("./helpers/dbFixtures");

beforeEach(async () => {
    await fixtures.resetTables();
    settingsService.getCommissionRate.mockResolvedValue(10); // 10%
    notificationService.notify.mockResolvedValue(undefined);
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("wallet.service.creditSellersForOrder (real database)", () => {
    it("credits a single seller net of commission and records a wallet_transactions row", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000 });
        const order = await fixtures.createOrder(buyer.id, { total_amount: 2000 });
        await fixtures.createOrderItem(order.id, product.id, seller.id, {
            quantity: 2, unit_price: 1000, subtotal: 2000
        });

        await walletService.creditSellersForOrder(order.id);

        const [[wallet]] = await db.query(
            "SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]
        );
        expect(Number(wallet.balance)).toBe(1800); // 2000 - 10%

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ?", [seller.id]
        );
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toEqual(
            expect.objectContaining({ type: "credit", reference_type: "order", reference_id: order.id })
        );
        expect(Number(transactions[0].amount)).toBe(1800);
        expect(Number(transactions[0].balance_after)).toBe(1800);

        const [[item]] = await db.query(
            "SELECT wallet_credited, commission_amount, seller_net_amount FROM order_items WHERE order_id = ?",
            [order.id]
        );
        expect(item.wallet_credited).toBe(1);
        expect(Number(item.commission_amount)).toBe(200);
        expect(Number(item.seller_net_amount)).toBe(1800);
    });

    it("splits a multi-vendor order into one credit per seller without cross-crediting", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const sellerA = await fixtures.createUser({ role: "seller" });
        const sellerB = await fixtures.createUser({ role: "seller" });
        const productA = await fixtures.createProduct(sellerA.id, { price: 1000 });
        const productB = await fixtures.createProduct(sellerB.id, { price: 2000 });
        const order = await fixtures.createOrder(buyer.id, { total_amount: 3000 });
        await fixtures.createOrderItem(order.id, productA.id, sellerA.id, { subtotal: 1000, unit_price: 1000 });
        await fixtures.createOrderItem(order.id, productB.id, sellerB.id, { subtotal: 2000, unit_price: 2000 });

        await walletService.creditSellersForOrder(order.id);

        const [[walletA]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [sellerA.id]);
        const [[walletB]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [sellerB.id]);
        expect(Number(walletA.balance)).toBe(900);   // 1000 - 10%
        expect(Number(walletB.balance)).toBe(1800);  // 2000 - 10%
    });

    it("is idempotent: a second call for the same order does not double-credit", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000 });
        const order = await fixtures.createOrder(buyer.id, { total_amount: 1000 });
        await fixtures.createOrderItem(order.id, product.id, seller.id, { subtotal: 1000, unit_price: 1000 });

        await walletService.creditSellersForOrder(order.id);
        await walletService.creditSellersForOrder(order.id); // re-run, e.g. a retried webhook

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(900); // still just the one 10%-off credit

        const [transactions] = await db.query("SELECT * FROM wallet_transactions WHERE seller_id = ?", [seller.id]);
        expect(transactions).toHaveLength(1);
    });

    it("accumulates balance across separate orders rather than overwriting it", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000 });

        const orderOne = await fixtures.createOrder(buyer.id, { total_amount: 1000 });
        await fixtures.createOrderItem(orderOne.id, product.id, seller.id, { subtotal: 1000, unit_price: 1000 });
        await walletService.creditSellersForOrder(orderOne.id);

        const orderTwo = await fixtures.createOrder(buyer.id, { total_amount: 500 });
        await fixtures.createOrderItem(orderTwo.id, product.id, seller.id, { subtotal: 500, unit_price: 500 });
        await walletService.creditSellersForOrder(orderTwo.id);

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(1350); // 900 + 450

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ? ORDER BY id", [seller.id]
        );
        expect(transactions).toHaveLength(2);
        expect(Number(transactions[1].balance_after)).toBe(1350);
    });

    it("does nothing and does not throw for an order with no uncredited items", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const order = await fixtures.createOrder(buyer.id, { total_amount: 0 });

        await expect(walletService.creditSellersForOrder(order.id)).resolves.toBeUndefined();
    });
});
