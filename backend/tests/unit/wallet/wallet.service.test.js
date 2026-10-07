jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/wallet/wallet.repository");
jest.mock("../../../src/modules/order/order.repository");
jest.mock("../../../src/modules/dispute/dispute.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/fraud/fraud.service");
jest.mock("../../../src/modules/subscription/subscription.service");

const db = require("../../../src/config/db");
const walletRepository = require("../../../src/modules/wallet/wallet.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const disputeRepository = require("../../../src/modules/dispute/dispute.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const notificationService = require("../../../src/modules/notification/notification.service");
const fraudService = require("../../../src/modules/fraud/fraud.service");
const subscriptionService = require("../../../src/modules/subscription/subscription.service");

const walletService = require("../../../src/modules/wallet/wallet.service");

const connection = db.__mockConnection;

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
    fraudService.evaluateWithdrawal.mockResolvedValue(undefined);
    // Every seller/provider defaults to the platform rate in these tests
    // (i.e. as if nobody has a paid subscription override) - see
    // subscription.service.js#getEffectiveCommissionRate, which
    // wallet.service.js now calls per-seller instead of
    // settingsService.getCommissionRate() directly.
    subscriptionService.getEffectiveCommissionRate.mockResolvedValue(10);

    // requestWithdrawal's gatekeeping (Phase 2): platform limits, no open
    // disputes, an unverified seller with plenty of daily headroom, nothing
    // requested today, and a payout method+details this seller has used
    // before (so no first-time-payout hold) - each test overrides only what
    // it is exercising.
    settingsService.getWithdrawalLimits.mockResolvedValue({
        minAmount: 100,
        maxAmount: 10000000,
        dailyCapByTier: { none: 10000000, id_verified: 20000000, business_verified: 50000000 },
        newPayoutHoldHours: 24,
        openDisputeBlockThreshold: 3
    });
    disputeRepository.countOpenBySeller.mockResolvedValue(0);
    walletRepository.getSellerVerificationTier.mockResolvedValue("none");
    walletRepository.sumWithdrawalsRequestedToday.mockResolvedValue(0);
    walletRepository.hasPriorPayoutUsage.mockResolvedValue(true);

    // Escrow sweep: return-window settings feed findReleasableItems.
    settingsService.getReturnWindowDays.mockResolvedValue(7);
    settingsService.getReturnWindowInsuredDays.mockResolvedValue(14);
});

// order_items rows as walletRepository.findUncreditedItemsByOrder returns
// them. commission_rate / commission_amount / seller_net_amount are the
// figures order.service#checkout snapshots at order time; all three are NULL
// on rows that predate that snapshot (the "legacy" shape), which is what makes
// creditSellersForOrder fall back to a fresh per-seller rate lookup.
const legacyItem = (overrides) => ({
    commission_rate: null, commission_amount: null, seller_net_amount: null, ...overrides
});
const snapshotItem = (overrides) => ({
    commission_rate: "10.00", commission_amount: "0", seller_net_amount: "0", ...overrides
});

const MOBILE_PAYOUT = "M-Pesa 0712345678";

describe("wallet.service.creditSellersForOrder", () => {
    it("is idempotent: commits and does nothing when there are no uncredited items", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([]);

        await walletService.creditSellersForOrder(1);

        expect(connection.commit).toHaveBeenCalled();
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("splits a multi-vendor order into one credit per seller, net of commission - held (escrow) for a platform-captured payment method (legacy rows: rate looked up fresh)", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            legacyItem({ id: 1, seller_id: 10, subtotal: "1000.00" }),
            legacyItem({ id: 2, seller_id: 10, subtotal: "500.00" }),
            legacyItem({ id: 3, seller_id: 20, subtotal: "2000.00" })
        ]);
        orderRepository.findOrderById.mockResolvedValue({ id: 42, payment_method: "mobile_money" });
        walletRepository.incrementHeldBalance.mockResolvedValue(1350); // arbitrary return value for the assertions below

        await walletService.creditSellersForOrder(42);

        // (Backend N+1 Fixes & Read Replica Adoption): items are
        // credited in one batched call now, not one markItemCredited
        // call per item - see wallet.repository.js#markItemsCredited.
        // seller 10: subtotal 1500, 10% commission = 150, net = 1350
        // seller 20: subtotal 2000, 10% commission = 200, net = 1800
        expect(walletRepository.markItemsCredited).toHaveBeenCalledWith(
            [
                { id: 1, commissionRate: 10, commissionAmount: 100, netAmount: 900 },
                { id: 2, commissionRate: 10, commissionAmount: 50, netAmount: 450 },
                { id: 3, commissionRate: 10, commissionAmount: 200, netAmount: 1800 }
            ],
            false,
            connection
        );

        // Escrowed method: money goes into held_balance, not the withdrawable balance.
        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, 1350, connection);
        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(20, 1800, connection);
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).toHaveBeenCalledTimes(2);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, description: expect.stringContaining("held pending release") }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it("Cash on Delivery: the agent already collected the cash, so only the platform commission is debited from the seller's balance (nothing is credited or held)", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            legacyItem({ id: 1, seller_id: 10, subtotal: "1000.00" })
        ]);
        orderRepository.findOrderById.mockResolvedValue({ id: 43, payment_method: "cash_on_delivery" });
        walletRepository.incrementBalance.mockResolvedValue(-100);

        await walletService.creditSellersForOrder(43);

        // released immediately (no platform-held money to hold back)
        expect(walletRepository.markItemsCredited).toHaveBeenCalledWith(
            [{ id: 1, commissionRate: 10, commissionAmount: 100, netAmount: 900 }],
            true,
            connection
        );
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -100, connection);
        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                sellerId: 10, type: "debit", amount: 100, balanceAfter: -100,
                referenceType: "cod_commission", referenceId: 43
            }),
            connection
        );
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 10, messageKey: "notifications.wallet.codCommissionDebited.message" })
        );
    });

    it("uses the commission snapshotted on the order items at checkout, unchanged, without consulting the seller's current rate", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            snapshotItem({ id: 1, seller_id: 10, subtotal: "1000.00", commission_rate: "5.00", commission_amount: "50.00", seller_net_amount: "950.00" }),
            snapshotItem({ id: 2, seller_id: 10, subtotal: "400.00", commission_rate: "5.00", commission_amount: "20.00", seller_net_amount: "380.00" })
        ]);
        orderRepository.findOrderById.mockResolvedValue({ id: 44, payment_method: "mobile_money" });
        // The seller has since moved to a plan with a very different rate;
        // it must have no effect on this already-placed order.
        subscriptionService.getEffectiveCommissionRate.mockResolvedValue(0);
        walletRepository.incrementHeldBalance.mockResolvedValue(1330);

        await walletService.creditSellersForOrder(44);

        expect(subscriptionService.getEffectiveCommissionRate).not.toHaveBeenCalled();
        expect(walletRepository.markItemsCredited).toHaveBeenCalledWith(
            [
                { id: 1, commissionRate: 5, commissionAmount: 50, netAmount: 950 },
                { id: 2, commissionRate: 5, commissionAmount: 20, netAmount: 380 }
            ],
            false,
            connection
        );
        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, 1330, connection);
    });

    it("only looks up a fresh rate for legacy rows (once per distinct seller) when snapshotted and legacy items are mixed", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([
            snapshotItem({ id: 1, seller_id: 10, subtotal: "1000.00", commission_rate: "5.00", commission_amount: "50.00", seller_net_amount: "950.00" }),
            legacyItem({ id: 2, seller_id: 20, subtotal: "1000.00" }),
            legacyItem({ id: 3, seller_id: 20, subtotal: "500.00" })
        ]);
        orderRepository.findOrderById.mockResolvedValue({ id: 45, payment_method: "mobile_money" });
        subscriptionService.getEffectiveCommissionRate.mockResolvedValue(20);
        walletRepository.incrementHeldBalance.mockResolvedValue(1);

        await walletService.creditSellersForOrder(45);

        expect(subscriptionService.getEffectiveCommissionRate).toHaveBeenCalledTimes(1);
        expect(subscriptionService.getEffectiveCommissionRate).toHaveBeenCalledWith(20);
        expect(walletRepository.markItemsCredited).toHaveBeenCalledWith(
            [
                { id: 1, commissionRate: 5, commissionAmount: 50, netAmount: 950 },
                { id: 2, commissionRate: 20, commissionAmount: 200, netAmount: 800 },
                { id: 3, commissionRate: 20, commissionAmount: 100, netAmount: 400 }
            ],
            false,
            connection
        );
    });

    it("rolls back and rethrows if a repository call fails mid-transaction", async () => {
        walletRepository.findUncreditedItemsByOrder.mockResolvedValue([legacyItem({ id: 1, seller_id: 10, subtotal: "1000.00" })]);
        orderRepository.findOrderById.mockResolvedValue({ id: 42, payment_method: "mobile_money" });
        walletRepository.markItemsCredited.mockRejectedValue(new Error("db write failed"));

        await expect(walletService.creditSellersForOrder(42)).rejects.toThrow("db write failed");
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});

describe("wallet.service.getWalletSummary", () => {
    it("surfaces held balance alongside available balance", async () => {
        walletRepository.getWallet.mockResolvedValue({ balance: "5000.00", held_balance: "1200.00" });
        walletRepository.findTransactions.mockResolvedValue([]);

        const result = await walletService.getWalletSummary(10);

        expect(result).toEqual({ balance: 5000, heldBalance: 1200, transactions: [] });
    });
});

describe("wallet.service.requestWithdrawal", () => {
    it("rejects a zero or negative amount (inside the wallet-locked transaction, so it rolls back)", async () => {
        // minAmount 0 so the platform-minimum check doesn't pre-empt the guard.
        settingsService.getWithdrawalLimits.mockResolvedValue({
            minAmount: 0, maxAmount: 10000000, dailyCapByTier: { none: 10000000 },
            newPayoutHoldHours: 24, openDisputeBlockThreshold: 3
        });
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });

        await expect(walletService.requestWithdrawal(10, 0, "mobile_money", MOBILE_PAYOUT)).rejects.toThrow(
            "must be greater than zero"
        );
        expect(connection.rollback).toHaveBeenCalled();
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("rejects a withdrawal larger than the current wallet balance", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "100.00" });

        await expect(walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT)).rejects.toThrow(
            "exceeds your wallet balance"
        );
        expect(connection.rollback).toHaveBeenCalled();
        expect(walletRepository.createWithdrawal).not.toHaveBeenCalled();
    });

    it("debits the wallet, records a withdrawal + transaction, and evaluates fraud after commit", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(77);

        const result = await walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT);

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -500, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "debit", referenceType: "withdrawal", referenceId: 77 }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(fraudService.evaluateWithdrawal).toHaveBeenCalledWith(10, 500);
        expect(result).toEqual({ withdrawalId: 77, balance: 4500, isNewPayoutDetails: false, holdUntil: null });
    });

    it("never lets a fraud-evaluation failure surface as a withdrawal failure (fire-and-forget)", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(77);
        fraudService.evaluateWithdrawal.mockRejectedValue(new Error("fraud service down"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await expect(walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT)).resolves.toMatchObject({ withdrawalId: 77 });

        consoleSpy.mockRestore();
    });
});

// ---- Phase 2 withdrawal guards: payout details, limits, disputes, hold ----

describe("wallet.service.requestWithdrawal - payout detail validation", () => {
    const expectRejectedBeforeAnyDbWork = async (method, details, message) => {
        await expect(walletService.requestWithdrawal(10, 500, method, details)).rejects.toThrow(message);
        expect(db.getConnection).not.toHaveBeenCalled();
        expect(walletRepository.createWithdrawal).not.toHaveBeenCalled();
    };

    it("rejects a mobile-money payout without a plausible phone number", async () => {
        await expectRejectedBeforeAnyDbWork("mobile_money", "M-Pesa", "valid phone number");
        await expectRejectedBeforeAnyDbWork("mpesa", "0712 345", "valid phone number"); // only 7 digits
        await expectRejectedBeforeAnyDbWork("mobile_money", {}, "valid phone number"); // not even a string of digits
    });

    it("rejects a bank payout missing the bank name/holder (letters) or a long enough account number", async () => {
        await expectRejectedBeforeAnyDbWork("bank_transfer", "0150123456789", "bank name, account number and account holder");
        await expectRejectedBeforeAnyDbWork("CRDB bank", "CRDB John 123", "bank name, account number and account holder");
    });

    it("accepts a well-formed mobile-money and bank payout", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(77);

        await expect(walletService.requestWithdrawal(10, 500, "mobile_money", "Tigo Pesa 0652 123 456")).resolves.toMatchObject({ withdrawalId: 77 });
        await expect(walletService.requestWithdrawal(10, 500, "bank_transfer", "CRDB - John Doe - 0150123456789")).resolves.toMatchObject({ withdrawalId: 77 });
    });
});

describe("wallet.service.requestWithdrawal - platform limits and abuse guards", () => {
    it("rejects an amount below the platform minimum / above the platform maximum", async () => {
        await expect(walletService.requestWithdrawal(10, 50, "mobile_money", MOBILE_PAYOUT))
            .rejects.toThrow("The minimum withdrawal amount is 100");
        await expect(walletService.requestWithdrawal(10, 20000000, "mobile_money", MOBILE_PAYOUT))
            .rejects.toThrow("The maximum withdrawal amount is 10000000");
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("blocks a seller who has reached the open-dispute threshold", async () => {
        disputeRepository.countOpenBySeller.mockResolvedValue(3);

        await expect(walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT))
            .rejects.toThrow("You have 3 open dispute(s)");
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("enforces the daily cap for the seller's verification tier, counting what was already requested today", async () => {
        walletRepository.getSellerVerificationTier.mockResolvedValue("none");
        walletRepository.sumWithdrawalsRequestedToday.mockResolvedValue(9900000);
        settingsService.getWithdrawalLimits.mockResolvedValue({
            minAmount: 100, maxAmount: 10000000,
            dailyCapByTier: { none: 10000000, id_verified: 20000000, business_verified: 50000000 },
            newPayoutHoldHours: 24, openDisputeBlockThreshold: 3
        });

        await expect(walletService.requestWithdrawal(10, 200000, "mobile_money", MOBILE_PAYOUT))
            .rejects.toThrow("over your account's daily limit of 10000000");
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it("applies the higher daily cap of a verified tier", async () => {
        walletRepository.getSellerVerificationTier.mockResolvedValue("id_verified");
        walletRepository.sumWithdrawalsRequestedToday.mockResolvedValue(9900000);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "50000000.00" });
        walletRepository.incrementBalance.mockResolvedValue(1);
        walletRepository.createWithdrawal.mockResolvedValue(80);

        await expect(walletService.requestWithdrawal(10, 200000, "mobile_money", MOBILE_PAYOUT))
            .resolves.toMatchObject({ withdrawalId: 80 });
    });

    it("falls back to the 'none' tier cap for an unrecognised verification tier", async () => {
        walletRepository.getSellerVerificationTier.mockResolvedValue("something_new");
        walletRepository.sumWithdrawalsRequestedToday.mockResolvedValue(9900000);

        await expect(walletService.requestWithdrawal(10, 200000, "mobile_money", MOBILE_PAYOUT))
            .rejects.toThrow("daily limit of 10000000");
    });

    it("puts the FIRST withdrawal to a new payout method+details on a hold window, recorded on the request", async () => {
        walletRepository.hasPriorPayoutUsage.mockResolvedValue(false);
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(81);

        const before = Date.now();
        const result = await walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT);
        const after = Date.now();

        expect(walletRepository.hasPriorPayoutUsage).toHaveBeenCalledWith(10, "mobile_money", MOBILE_PAYOUT);
        expect(result.isNewPayoutDetails).toBe(true);
        const holdMs = result.holdUntil.getTime();
        expect(holdMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
        expect(holdMs).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
        expect(walletRepository.createWithdrawal).toHaveBeenCalledWith(
            10, 500, "mobile_money", MOBILE_PAYOUT, connection, "TZS", null, null, result.holdUntil, true
        );
    });
});

// ---- (Revenue & Product) - multi-currency payouts ------------------

describe("wallet.service.requestWithdrawal - multi-currency payouts", () => {
    it("defaults to a TZS payout with no exchange-rate conversion", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(77);

        await walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT);

        expect(settingsService.getUsdExchangeRate).not.toHaveBeenCalled();
        expect(walletRepository.createWithdrawal).toHaveBeenCalledWith(
            10, 500, "mobile_money", MOBILE_PAYOUT, connection, "TZS", null, null, null, false
        );
    });

    it("converts to a USD-equivalent payout amount using the current exchange rate, snapshotting the rate used", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500000);
        walletRepository.createWithdrawal.mockResolvedValue(78);
        settingsService.getUsdExchangeRate.mockResolvedValue(2500);

        const result = await walletService.requestWithdrawal(10, 500000, "mobile_money", MOBILE_PAYOUT, "USD");

        expect(settingsService.getUsdExchangeRate).toHaveBeenCalled();
        expect(walletRepository.createWithdrawal).toHaveBeenCalledWith(
            10, 500000, "mobile_money", MOBILE_PAYOUT, connection, "USD", 200, 2500, null, false
        );
        expect(result).toMatchObject({ withdrawalId: 78, balance: 4500000 });
    });

    it("still debits the TZS-denominated wallet balance itself, unaffected by the payout currency", async () => {
        walletRepository.getWalletForUpdate.mockResolvedValue({ balance: "5000.00" });
        walletRepository.incrementBalance.mockResolvedValue(4500);
        walletRepository.createWithdrawal.mockResolvedValue(78);
        settingsService.getUsdExchangeRate.mockResolvedValue(2500);

        await walletService.requestWithdrawal(10, 500, "mobile_money", MOBILE_PAYOUT, "USD");

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, -500, connection);
    });
});

describe("wallet.service.processWithdrawal", () => {
    it("throws when the withdrawal request doesn't exist", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue(null);

        await expect(walletService.processWithdrawal(1, "approve", null)).rejects.toThrow("Withdrawal request not found");
    });

    it("throws when the withdrawal is already in a terminal state", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "rejected", seller_id: 10, amount: "500" });

        await expect(walletService.processWithdrawal(1, "approve", null)).rejects.toThrow('is already "rejected"');
    });

    it("allows marking an already-approved withdrawal as paid, recording the payout reference", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "approved", seller_id: 10, amount: "500" });

        const result = await walletService.processWithdrawal(1, "paid", null, "MPESA-TXN-889");

        expect(result).toEqual({ status: "paid" });
        expect(walletRepository.updateWithdrawalStatus).toHaveBeenCalledWith(1, "paid", null, connection, "MPESA-TXN-889");
    });

    it("requires a payout reference/receipt to mark a withdrawal as paid", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "approved", seller_id: 10, amount: "500" });

        await expect(walletService.processWithdrawal(1, "paid", null)).rejects.toThrow("payout reference/receipt is required");

        expect(walletRepository.updateWithdrawalStatus).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
    });

    it("can't skip approval: a still-pending withdrawal can't be marked paid, and an approved one can't be approved again", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "pending", seller_id: 10, amount: "500" });
        await expect(walletService.processWithdrawal(1, "paid", null, "REF")).rejects.toThrow('This request is already "pending"');

        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "approved", seller_id: 10, amount: "500" });
        await expect(walletService.processWithdrawal(1, "approve", null)).rejects.toThrow('This request is already "approved"');
        await expect(walletService.processWithdrawal(1, "reject", null)).rejects.toThrow('This request is already "approved"');

        expect(walletRepository.updateWithdrawalStatus).not.toHaveBeenCalled();
    });

    it("blocks approving a first-time-payout withdrawal until its hold window has passed", async () => {
        const holdUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "pending", seller_id: 10, amount: "500", hold_until: holdUntil });

        await expect(walletService.processWithdrawal(1, "approve", null)).rejects.toThrow("can't be approved until");
        expect(walletRepository.updateWithdrawalStatus).not.toHaveBeenCalled();
    });

    it("approves once the hold window has passed (and a null hold_until never blocks)", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({
            id: 1, status: "pending", seller_id: 10, amount: "500", hold_until: new Date(Date.now() - 60 * 1000)
        });
        await expect(walletService.processWithdrawal(1, "approve", null)).resolves.toEqual({ status: "approved" });
        expect(walletRepository.updateWithdrawalStatus).toHaveBeenCalledWith(1, "approved", null, connection, null);

        walletRepository.findWithdrawalById.mockResolvedValue({ id: 2, status: "pending", seller_id: 10, amount: "500", hold_until: null });
        await expect(walletService.processWithdrawal(2, "approve", null)).resolves.toEqual({ status: "approved" });
    });

    it("lets an admin reject a pending withdrawal even while it is still inside the hold window", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({
            id: 1, status: "pending", seller_id: 10, amount: "500", hold_until: new Date(Date.now() + 60 * 60 * 1000)
        });
        walletRepository.incrementBalance.mockResolvedValue(1000);

        await expect(walletService.processWithdrawal(1, "reject", "suspicious")).resolves.toEqual({ status: "rejected" });
    });

    it("refunds the seller's wallet when rejecting a pending withdrawal", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "pending", seller_id: 10, amount: "500" });
        walletRepository.incrementBalance.mockResolvedValue(1000);

        const result = await walletService.processWithdrawal(1, "reject", "duplicate request");

        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 500, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, type: "credit", referenceType: "withdrawal" }),
            connection
        );
        expect(result).toEqual({ status: "rejected" });
    });

    it("rejects an invalid action", async () => {
        walletRepository.findWithdrawalById.mockResolvedValue({ id: 1, status: "pending", seller_id: 10, amount: "500" });

        await expect(walletService.processWithdrawal(1, "bogus", null)).rejects.toThrow("Invalid action");
    });
});

// ----- Seller Release --------------------------------------------

describe("wallet.service.releaseEligibleEarnings", () => {
    it("does nothing when there are no releasable items", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(summary).toEqual({ released: 0, closedByDispute: 0, frozen: 0, amountReleased: 0, errored: 0 });
        expect(disputeRepository.findByOrderId).not.toHaveBeenCalled();
    });

    it("releases an item with no dispute: moves held -> available and marks it released", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(900);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, -900, connection);
        expect(walletRepository.incrementBalance).toHaveBeenCalledWith(10, 900, connection);
        expect(walletRepository.markItemReleased).toHaveBeenCalledWith(1, connection);
        expect(walletRepository.insertTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ sellerId: 10, referenceType: "escrow_release", referenceId: 42 }),
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(summary).toEqual({ released: 1, closedByDispute: 0, frozen: 0, amountReleased: 900, errored: 0 });
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 10, type: "wallet_release" })
        );
    });

    it("freezes an item with an open dispute against it and doesn't move any money", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: 1, status: "open", resolution: null }
        ]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.markItemReleased).not.toHaveBeenCalled();
        expect(summary).toEqual({ released: 0, closedByDispute: 0, frozen: 1, amountReleased: 0, errored: 0 });
    });

    it("freezes an item covered by a whole-order dispute (order_item_id is null)", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: null, status: "under_review", resolution: null }
        ]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.markItemReleased).not.toHaveBeenCalled();
        expect(summary.frozen).toBe(1);
    });

    it("closes out (no money moved) an item whose dispute already resolved with a refund", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: 1, status: "resolved", resolution: "refund_partial" }
        ]);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).not.toHaveBeenCalled();
        expect(walletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(walletRepository.insertTransaction).not.toHaveBeenCalled();
        expect(walletRepository.markItemReleased).toHaveBeenCalledWith(1, connection);
        expect(summary).toEqual({ released: 0, closedByDispute: 1, frozen: 0, amountReleased: 0, errored: 0 });
    });

    it("releases normally when the only dispute on the order resolved without a refund", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: 1, status: "rejected", resolution: "no_action" }
        ]);
        walletRepository.incrementBalance.mockResolvedValue(900);

        const summary = await walletService.releaseEligibleEarnings();

        expect(walletRepository.incrementHeldBalance).toHaveBeenCalledWith(10, -900, connection);
        expect(summary.released).toBe(1);
    });

    it("scans for releasable items using the escrow hold days and both return-window settings", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        settingsService.getReturnWindowDays.mockResolvedValue(7);
        settingsService.getReturnWindowInsuredDays.mockResolvedValue(14);
        walletRepository.findReleasableItems.mockResolvedValue([]);

        await walletService.releaseEligibleEarnings();

        expect(walletRepository.findReleasableItems).toHaveBeenCalledWith(5, 7, 14);
    });

    it("one failing item doesn't block the rest of the sweep: it's rolled back, counted as errored, and the others still release", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "500.00" },
            { id: 2, order_id: 43, seller_id: 20, seller_net_amount: "300.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(500);
        walletRepository.markItemReleased
            .mockRejectedValueOnce(new Error("deadlock found"))
            .mockResolvedValueOnce(undefined);

        const summary = await walletService.releaseEligibleEarnings();

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(summary).toEqual({ released: 1, closedByDispute: 0, frozen: 0, amountReleased: 300, errored: 1 });
    });

    it("only fetches each order's disputes once even with multiple items on the same order", async () => {
        settingsService.getEscrowHoldDays.mockResolvedValue(5);
        walletRepository.findReleasableItems.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "500.00" },
            { id: 2, order_id: 42, seller_id: 10, seller_net_amount: "300.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(500);

        await walletService.releaseEligibleEarnings();

        expect(disputeRepository.findByOrderId).toHaveBeenCalledTimes(1);
    });
});

describe("wallet.service.releaseOrderEarnings", () => {
    it("throws when the order has nothing left to release", async () => {
        walletRepository.findReleasableItemsForOrder.mockResolvedValue([]);

        await expect(walletService.releaseOrderEarnings(42)).rejects.toThrow(
            "No held earnings are eligible for release"
        );
    });

    it("bypasses the delivered/hold-days timing gate but still freezes on an open dispute", async () => {
        walletRepository.findReleasableItemsForOrder.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([
            { id: 5, order_item_id: null, status: "open", resolution: null }
        ]);

        const summary = await walletService.releaseOrderEarnings(42);

        expect(walletRepository.markItemReleased).not.toHaveBeenCalled();
        expect(summary).toEqual({ released: 0, closedByDispute: 0, frozen: 1, amountReleased: 0, errored: 0 });
    });

    it("releases eligible items for the order when nothing blocks them", async () => {
        walletRepository.findReleasableItemsForOrder.mockResolvedValue([
            { id: 1, order_id: 42, seller_id: 10, seller_net_amount: "900.00" }
        ]);
        disputeRepository.findByOrderId.mockResolvedValue([]);
        walletRepository.incrementBalance.mockResolvedValue(900);

        const summary = await walletService.releaseOrderEarnings(42);

        expect(summary.released).toBe(1);
    });
});
