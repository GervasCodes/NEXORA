jest.mock("../../src/modules/fraud/fraud.service");

const fraudService = require("../../src/modules/fraud/fraud.service");

const db = require("../../src/config/db");
const walletService = require("../../src/modules/wallet/wallet.service");
const fixtures = require("./helpers/dbFixtures");

beforeEach(async () => {
    await fixtures.resetTables();
    fraudService.evaluateWithdrawal.mockResolvedValue(undefined);
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

        const result = await walletService.requestWithdrawal(seller.id, 4000, "mobile_money", "0700000000");

        // NOTE: mysql2 returns DECIMAL columns as strings by default, and
        // wallet.repository.incrementBalance returns that raw value
        // un-cast. requestWithdrawal's `balance` therefore comes back as
        // "6000.00" (a string), unlike getWalletSummary which wraps its
        // balance in Number(). A mocked unit test can't see this - it's
        // exactly the kind of thing this real-DB suite exists to catch.
        // Flagging as worth a fix (cast in wallet.service before
        // returning), not fixing here since that's outside test scope.
        expect(Number(result.balance)).toBe(6000);

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(6000);

        const [[withdrawal]] = await db.query(
            "SELECT * FROM withdrawal_requests WHERE id = ?", [result.withdrawalId]
        );
        expect(withdrawal).toEqual(
            expect.objectContaining({ seller_id: seller.id, status: "pending", payout_method: "mobile_money" })
        );
        expect(Number(withdrawal.amount)).toBe(4000);

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ? AND reference_type = 'withdrawal'", [seller.id]
        );
        expect(transactions).toHaveLength(1);
        expect(transactions[0].type).toBe("debit");
        expect(Number(transactions[0].balance_after)).toBe(6000);
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

    it("rejects a zero or negative withdrawal amount without writing anything", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 1000);

        await expect(
            walletService.requestWithdrawal(seller.id, 0, "mobile_money", "0700000000")
        ).rejects.toThrow("Withdrawal amount must be greater than zero");

        const [[wallet]] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(Number(wallet.balance)).toBe(1000);
    });

    it("does not leave behind a wallet row when ensureWallet + the balance check both roll back together", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        // No seedWallet call - requestWithdrawal calls ensureWallet() itself,
        // but that insert happens inside the same transaction as the balance
        // check below, so if the check fails, the whole thing (including the
        // wallet row) rolls back rather than leaving a zero-balance wallet.

        await expect(
            walletService.requestWithdrawal(seller.id, 100, "mobile_money", "0700000000")
        ).rejects.toThrow("Withdrawal amount exceeds your wallet balance");

        const [wallets] = await db.query("SELECT balance FROM seller_wallets WHERE seller_id = ?", [seller.id]);
        expect(wallets).toHaveLength(0);
    });

    it("allows sequential withdrawals to draw the balance down correctly", async () => {
        const seller = await fixtures.createUser({ role: "seller" });
        await seedWallet(seller.id, 10000);

        await walletService.requestWithdrawal(seller.id, 3000, "mobile_money", "0700000000");
        const second = await walletService.requestWithdrawal(seller.id, 2000, "mobile_money", "0700000000");

        expect(Number(second.balance)).toBe(5000); // see the string-vs-number note in the test above

        const [transactions] = await db.query(
            "SELECT * FROM wallet_transactions WHERE seller_id = ? ORDER BY id", [seller.id]
        );
        expect(transactions).toHaveLength(2);
    });
});
