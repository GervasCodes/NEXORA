// Wallet: a seller sees only their own withdrawals; payout details are masked in the admin list and are
// only revealed after an audit entry is written.
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/wallet/wallet.repository");
jest.mock("../../src/modules/audit/audit.repository", () => ({ insertLog: jest.fn() }));

const walletRepository = require("../../src/modules/wallet/wallet.repository");
const auditRepository = require("../../src/modules/audit/audit.repository");
const walletService = require("../../src/modules/wallet/wallet.service");

const withdrawal = { id: 7, seller_id: 3, payout_method: "mobile_money", payout_details: "+255712345678" };

beforeEach(() => {
    jest.clearAllMocks();
    auditRepository.insertLog.mockResolvedValue();
    walletRepository.findAllWithdrawals.mockResolvedValue([withdrawal]);
});

describe("wallet ownership and payout privacy", () => {
    it("a seller's withdrawal list is always queried by their own id", async () => {
        walletRepository.findWithdrawalsBySeller.mockResolvedValue([]);
        await walletService.getMyWithdrawals(5);
        expect(walletRepository.findWithdrawalsBySeller).toHaveBeenCalledWith(5);
    });
    it("the admin list never carries the full payout details", async () => {
        const [row] = await walletService.listAllWithdrawals();
        expect(row.payout_details_masked).toBe(true);
        expect(JSON.stringify(row)).not.toContain("+255712345678");
    });
    it("revealing payout details writes an audit entry naming the admin and the withdrawal", async () => {
        const result = await walletService.getWithdrawalPayoutDetails(7, { adminId: 1, req: { ip: "1.2.3.4" } });
        expect(result.payout_details).toBe("+255712345678");
        expect(auditRepository.insertLog).toHaveBeenCalledWith(expect.objectContaining({
            userId: 1, eventType: "payout_details_revealed", ipAddress: "1.2.3.4"
        }));
    });
    it("no audit entry means no reveal", async () => {
        auditRepository.insertLog.mockRejectedValue(new Error("audit db down"));
        await expect(walletService.getWithdrawalPayoutDetails(7, { adminId: 1 })).rejects.toThrow("audit db down");
    });
    it("an unknown withdrawal is a 404 and writes no audit entry", async () => {
        await expect(walletService.getWithdrawalPayoutDetails(999, { adminId: 1 })).rejects.toMatchObject({ status: 404 });
        expect(auditRepository.insertLog).not.toHaveBeenCalled();
    });
});
