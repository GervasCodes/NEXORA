jest.mock("../../src/modules/fraud/fraud.service");
jest.mock("../../src/modules/settings/settings.service");
jest.mock("../../src/modules/notification/notification.service");

const fraudService = require("../../src/modules/fraud/fraud.service");
const settingsService = require("../../src/modules/settings/settings.service");
const notificationService = require("../../src/modules/notification/notification.service");

const db = require("../../src/config/db");
const walletService = require("../../src/modules/wallet/wallet.service");
const fixtures = require("./helpers/dbFixtures");

// Phase 2 added withdrawal limits/caps/holds that all read from
// settingsService - mocked here (rather than relying on migration 120's
// seeded defaults) so these tests are self-contained and don't silently
// change behavior if the seeded defaults are ever retuned.
const DEFAULT_LIMITS = {
    minAmount: 5000,
    maxAmount: 5000000,
    dailyCapByTier: { none: 200000, id_verified: 2000000, business_verified: 10000000 },
    newPayoutHoldHours: 24,
    openDisputeBlockThreshold: 3
};

beforeEach(async () => {
    await fixtures.resetTables();
    fraudService.evaluateWithdrawal.mockResolvedValue(undefined);
    notificationService.notify.mockResolvedValue(undefined);
    settingsService.getWithdrawalLimits.mockResolvedValue(DEFAULT_LIMITS);
    settingsService.getUsdExchangeRate.mockResolvedValue(2600);
});

afterAll(async () => {
    await fixtures.closePool();
});

// Seeds a seller with an existing wallet balance, bypassing
// creditSellersForOrder since these tests care about the withdrawal
// transaction itself, not how the balance got there.
const seedWallet = async (sellerId, balance) => {
    await db.query("INSERT INTO seller_wallets (seller_id, balance) VALUES (?, ?)", [sellerId, balance]);
};

describe("wallet.service.requestWithdrawal (real database)", () => {
    it("debits the wallet, creates a withdrawal_requests row, and logs a debit transaction", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 10000);

        const result = await walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000");

        // NOTE: mysql2 returns DECIMAL columns as strings by default, and
        // wallet.repository.incrementBalance returns that raw value
        // un-cast. requestWithdrawal's `balance` therefore comes back as
        // a numeric string, unlike getWalletSummary which wraps its
        // balance in Number(). Flagging as worth a fix (cast in
        // wallet.service before returning), not fixing here since that's
        // outside test scope.
        expect(Number(result.balance)).toBe(4000);

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(4000);

        const [[withdrawal]] = await db.query(
            "SELECT * FROM withdrawal_requests WHERE id = ?", [result.withdrawalId]
        );
        expect(withdrawal).toEqual(
            expect.objectContaining({ seller_id: seller.id, status: "pending", payout_method: "mobile_money" })
        );
        expect(Number(withdrawal.amount)).toBe(6000);
        // First-ever withdrawal to these payout details for this seller -
        // Phase 2's 24-hour hold applies.
        expect(withdrawal.payout_details_is_new).toBe(1);
        expect(withdrawal.hold_until).not.toBeNull();

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ? AND reference_type = 'withdrawal'", [seller.id]
        );
        expect(transactions).toHaveLength(1);
        expect(transactions[0].type).toBe("debit");
        expect(Number(transactions[0].balance_after)).toBe(4000);
    });

    it("does not hold a second withdrawal to the same payout details already used before", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 50000);

        await walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000");
        const second = await walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000");

        expect(second.isNewPayoutDetails).toBe(false);
        expect(second.holdUntil).toBeNull();

        const [[withdrawal]] = await db.query(
            "SELECT payout_details_is_new, hold_until FROM withdrawal_requests WHERE id = ?", [second.withdrawalId]
        );
        expect(withdrawal.payout_details_is_new).toBe(0);
        expect(withdrawal.hold_until).toBeNull();
    });

    it("rejects a withdrawal below the platform's minimum amount", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 10000);

        await expect(
            walletService.requestWithdrawal(seller.id, 1000, "mobile_money", "0700000000")
        ).rejects.toThrow("The minimum withdrawal amount is 5000");

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(10000); // unchanged
    });

    it("rejects a withdrawal above the platform's maximum amount", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 100000000);

        await expect(
            walletService.requestWithdrawal(seller.id, 6000000, "mobile_money", "0700000000")
        ).rejects.toThrow("The maximum withdrawal amount is 5000000");
    });

    it("rejects a withdrawal that would exceed today's tier daily cap", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 500000);
        // Default verification_tier for a fresh user is 'none' - cap 200000.

        await walletService.requestWithdrawal(seller.id, 150000, "mobile_money", "0700000000");

        await expect(
            walletService.requestWithdrawal(seller.id, 100000, "mobile_money", "0711111111")
        ).rejects.toThrow(/daily limit of 200000/);
    });

    it("rejects a withdrawal when the seller has too many open disputes", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        const buyer = await fixtures.createUser({ role: "buyer" });
        await seedWallet(seller.id, 50000);

        const order = await fixtures.createOrder(buyer.id, { total_amount: 1000 });
        for (let i = 0; i < 3; i += 1) {
            await db.query(
                `INSERT INTO disputes (dispute_number, order_id, buyer_id, seller_id, type, status, subject, description)
                VALUES (?, ?, ?, ?, 'other', 'open', 'Test dispute', 'Test dispute description')`,
                [`DSP-TEST-${Date.now()}-${i}`, order.id, buyer.id, seller.id]
            );
        }

        await expect(
            walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000")
        ).rejects.toThrow(/open dispute/);

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(50000); // unchanged - never reached the debit
    });

    it("rejects payout details that don't look like a real mobile money number", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 50000);

        await expect(
            walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "call me")
        ).rejects.toThrow(/mobile money network and a valid phone number/);
    });

    it("rejects a withdrawal larger than the wallet balance and leaves the balance untouched", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 1000);

        await expect(
            walletService.requestWithdrawal(seller.id, 5000, "mobile_money", "0700000000")
        ).rejects.toThrow("Withdrawal amount exceeds your wallet balance");

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(1000); // unchanged - the transaction rolled back

        const [transactions] = await db.query("SELECT * FROM wallet_transactions WHERE seller_id = ?", [seller.id]);
        expect(transactions).toHaveLength(0);

        const [withdrawals] = await db.query("SELECT * FROM withdrawal_requests WHERE seller_id = ?", [seller.id]);
        expect(withdrawals).toHaveLength(0);
    });

    it("does not leave behind a wallet row when ensureWallet + the balance check both roll back together", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        // No seedWallet call - requestWithdrawal calls ensureWallet() itself,
        // but that insert happens inside the same transaction as the balance
        // check below, so if the check fails, the whole thing (including the
        // wallet row) rolls back rather than leaving a zero-balance wallet.

        await expect(
            walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000")
        ).rejects.toThrow("Withdrawal amount exceeds your wallet balance");

        const [wallets] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(wallets).toHaveLength(0);
    });

    it("allows sequential withdrawals to draw the balance down correctly", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 30000);

        await walletService.requestWithdrawal(seller.id, 8000, "mobile_money", "0700000000");
        const second = await walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000");

        expect(Number(second.balance)).toBe(16000); // see the string-vs-number note in the test above

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ? ORDER BY id", [seller.id]
        );
        expect(transactions).toHaveLength(2);
    });
});

describe("wallet.service.processWithdrawal (real database) - Phase 2 additions", () => {
    it("refuses to approve a withdrawal still inside its first-time-payout-details hold", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 50000);

        const { withdrawalId } = await walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000");

        await expect(
            walletService.processWithdrawal(withdrawalId, "approve", null)
        ).rejects.toThrow(/first withdrawal to these payout details/);

        const [[withdrawal]] = await db.query("SELECT status FROM withdrawal_requests WHERE id = ?", [withdrawalId]);
        expect(withdrawal.status).toBe("pending");
    });

    it("approves a withdrawal once the hold has passed, and requires a payout reference to mark it paid", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 50000);

        const { withdrawalId } = await walletService.requestWithdrawal(seller.id, 6000, "mobile_money", "0700000000");
        // Simulate the 24-hour hold having already elapsed.
        await db.query("UPDATE withdrawal_requests SET hold_until = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?", [withdrawalId]);

        await walletService.processWithdrawal(withdrawalId, "approve", null);

        await expect(
            walletService.processWithdrawal(withdrawalId, "paid", null)
        ).rejects.toThrow(/payout reference/);

        await walletService.processWithdrawal(withdrawalId, "paid", null, "MPESA-REF-12345");

        const [[withdrawal]] = await db.query("SELECT status, payout_reference FROM withdrawal_requests WHERE id = ?", [withdrawalId]);
        expect(withdrawal.status).toBe("paid");
        expect(withdrawal.payout_reference).toBe("MPESA-REF-12345");
    });
});
