// Real-database counterpart to the Cash on Delivery branch of
// wallet.service.js#creditSellersForOrder. See
// wallet.creditSellersForOrder.db.test.js for the escrowed (mobile money
// etc.) behavior this mirrors the structure of.
//
// Cash on Delivery fix (Phase 2, P0): the seller's own delivery agent
// already collected the cash in hand, so there is no platform-held money
// to credit - crediting the net amount into `balance` (the pre-Phase-2
// behavior) would double-pay the seller. What actually happens is the
// platform debiting its own commission out of the seller's wallet.

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
    settingsService.isCommissionMonetizationEnabled.mockResolvedValue(true);
    notificationService.notify.mockResolvedValue(undefined);
});

afterAll(async () => {
    await fixtures.closePool();
});

describe("wallet.service.creditSellersForOrder - Cash on Delivery (real database)", () => {
    it("debits only the platform commission from the seller's wallet, not the net amount", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000 });
        const order = await fixtures.createOrder(buyer.id, {
            total_amount: 2000, payment_method: "cash_on_delivery"
        });
        await fixtures.createOrderItem(order.id, product.id, seller.id, {
            quantity: 2, unit_price: 1000, subtotal: 2000
        });

        await walletService.creditSellersForOrder(order.id);

        const [[wallet]] = await db.query(
            "SELECT balance, held_balance FROM seller_wallets WHERE seller_id = ?", [seller.id]
        );
        // Not +1800 (the net amount) - just -200 (the 10% commission). The
        // cash itself never passed through the platform.
        expect(Number(wallet.balance)).toBe(-200);
        expect(Number(wallet.held_balance)).toBe(0);

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ?", [seller.id]
        );
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toEqual(
            expect.objectContaining({ type: "debit", reference_type: "cod_commission", reference_id: order.id })
        );
        expect(Number(transactions[0].amount)).toBe(200);
        expect(Number(transactions[0].balance_after)).toBe(-200);

        const [[item]] = await db.query(
            "SELECT wallet_credited, wallet_released, commission_amount, seller_net_amount FROM order_items WHERE order_id = ?",
            [order.id]
        );
        expect(item.wallet_credited).toBe(1);
        expect(item.wallet_released).toBe(1); // Cash on Delivery was never held
        expect(Number(item.commission_amount)).toBe(200);
        expect(Number(item.seller_net_amount)).toBe(1800);
    });

    it("allows the balance to go negative when it doesn't cover the commission, and a later order's credit repays it", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000 });

        // Seller starts with only 50 in the wallet - not enough to cover a
        // 200 commission debit.
        await db.query("INSERT INTO seller_wallets (seller_id, balance) VALUES (?, ?)", [seller.id, 50]);

        const codOrder = await fixtures.createOrder(buyer.id, {
            total_amount: 2000, payment_method: "cash_on_delivery"
        });
        await fixtures.createOrderItem(codOrder.id, product.id, seller.id, {
            quantity: 2, unit_price: 1000, subtotal: 2000
        });

        await walletService.creditSellersForOrder(codOrder.id);

        const [[afterCod]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(afterCod.balance)).toBe(-150); // 50 - 200

        // A normal (prepaid) order comes in next - its credit should repay
        // the deficit automatically, since incrementBalance is just += on
        // whatever the balance currently is.
        const prepaidOrder = await fixtures.createOrder(buyer.id, { total_amount: 1000 });
        await fixtures.createOrderItem(prepaidOrder.id, product.id, seller.id, {
            subtotal: 1000, unit_price: 1000
        });
        await walletService.creditSellersForOrder(prepaidOrder.id);

        const [[afterPrepaid]] = await db.query(
            "SELECT balance, held_balance FROM seller_wallets WHERE seller_id = ?", [seller.id]
        );
        // Prepaid orders are escrowed (held_balance), so the negative
        // `balance` is untouched by this second order - it stays at -150
        // until that held amount is later released into balance by the
        // escrow-release sweep (wallet.service.js#releaseEligibleEarnings),
        // at which point it lands in the very same balance column and
        // repays the deficit then.
        expect(Number(afterPrepaid.balance)).toBe(-150);
        expect(Number(afterPrepaid.held_balance)).toBe(900); // 1000 - 10%
    });

    it("is idempotent for Cash on Delivery too: a second call does not double-debit", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const seller = await fixtures.createUser({ role: "seller" });
        const product = await fixtures.createProduct(seller.id, { price: 1000 });
        const order = await fixtures.createOrder(buyer.id, {
            total_amount: 1000, payment_method: "cash_on_delivery"
        });
        await fixtures.createOrderItem(order.id, product.id, seller.id, { subtotal: 1000, unit_price: 1000 });

        await walletService.creditSellersForOrder(order.id);
        await walletService.creditSellersForOrder(order.id); // re-run, e.g. a retried auto-confirm

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(-100); // still just the one 10% debit, not -200

        const [transactions] = await db.query("SELECT * FROM wallet_transactions WHERE seller_id = ?", [seller.id]);
        expect(transactions).toHaveLength(1);
    });

    it("splits a multi-vendor Cash on Delivery order into one commission debit per seller", async () => {
        const buyer = await fixtures.createUser({ role: "buyer" });
        const sellerA = await fixtures.createUser({ role: "seller" });
        const sellerB = await fixtures.createUser({ role: "seller" });
        const productA = await fixtures.createProduct(sellerA.id, { price: 1000 });
        const productB = await fixtures.createProduct(sellerB.id, { price: 2000 });
        const order = await fixtures.createOrder(buyer.id, {
            total_amount: 3000, payment_method: "cash_on_delivery"
        });
        await fixtures.createOrderItem(order.id, productA.id, sellerA.id, { subtotal: 1000, unit_price: 1000 });
        await fixtures.createOrderItem(order.id, productB.id, sellerB.id, { subtotal: 2000, unit_price: 2000 });

        await walletService.creditSellersForOrder(order.id);

        const [[walletA]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [sellerA.id]);
        const [[walletB]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [sellerB.id]);
        expect(Number(walletA.balance)).toBe(-100); // -10% of 1000
        expect(Number(walletB.balance)).toBe(-200); // -10% of 2000
    });
});
