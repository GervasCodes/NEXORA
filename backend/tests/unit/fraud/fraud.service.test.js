jest.mock("../../../src/modules/fraud/fraud.repository");

const fraudRepository = require("../../../src/modules/fraud/fraud.repository");
const fraudService = require("../../../src/modules/fraud/fraud.service");

describe("fraud.service.evaluateOrder", () => {
    beforeEach(() => {
        fraudRepository.hasOpenFlag.mockResolvedValue(false);
        fraudRepository.createFlag.mockResolvedValue(undefined);
        fraudRepository.countRecentOrdersByBuyer.mockResolvedValue(0);
    });

    it("flags a high-value first order above the threshold", async () => {
        fraudRepository.getBuyerPriorOrderStats.mockResolvedValue({ priorOrderCount: 1 });

        await fraudService.evaluateOrder({ id: 1, buyer_id: 5, total_amount: 1_500_000 });

        expect(fraudRepository.createFlag).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: "order", entityId: 1, ruleCode: "high_value_first_order" })
        );
    });

    it("does not flag a high-value order from a returning buyer", async () => {
        fraudRepository.getBuyerPriorOrderStats.mockResolvedValue({ priorOrderCount: 5 });

        await fraudService.evaluateOrder({ id: 1, buyer_id: 5, total_amount: 1_500_000 });

        expect(fraudRepository.createFlag).not.toHaveBeenCalledWith(
            expect.objectContaining({ ruleCode: "high_value_first_order" })
        );
    });

    it("does not flag a small first order", async () => {
        fraudRepository.getBuyerPriorOrderStats.mockResolvedValue({ priorOrderCount: 1 });

        await fraudService.evaluateOrder({ id: 1, buyer_id: 5, total_amount: 10_000 });

        expect(fraudRepository.createFlag).not.toHaveBeenCalled();
    });

    it("flags order velocity when the buyer placed several orders quickly", async () => {
        fraudRepository.getBuyerPriorOrderStats.mockResolvedValue({ priorOrderCount: 5 });
        fraudRepository.countRecentOrdersByBuyer.mockResolvedValue(4);

        await fraudService.evaluateOrder({ id: 1, buyer_id: 5, total_amount: 10_000 });

        expect(fraudRepository.createFlag).toHaveBeenCalledWith(
            expect.objectContaining({ ruleCode: "order_velocity" })
        );
    });

    it("does not create a duplicate flag if one is already open for this rule", async () => {
        fraudRepository.getBuyerPriorOrderStats.mockResolvedValue({ priorOrderCount: 1 });
        fraudRepository.hasOpenFlag.mockResolvedValue(true);

        await fraudService.evaluateOrder({ id: 1, buyer_id: 5, total_amount: 1_500_000 });

        expect(fraudRepository.createFlag).not.toHaveBeenCalled();
    });
});

describe("fraud.service.evaluateWithdrawal", () => {
    beforeEach(() => {
        fraudRepository.hasOpenFlag.mockResolvedValue(false);
        fraudRepository.createFlag.mockResolvedValue(undefined);
    });

    it("skips the outlier check when there isn't enough withdrawal history yet", async () => {
        fraudRepository.getSellerPriorWithdrawalStats.mockResolvedValue({ priorCount: 1, avgAmount: 1000 });

        await fraudService.evaluateWithdrawal(1, 100_000);

        expect(fraudRepository.createFlag).not.toHaveBeenCalled();
    });

    it("flags a withdrawal that's a large outlier vs the seller's usual amount", async () => {
        fraudRepository.getSellerPriorWithdrawalStats.mockResolvedValue({ priorCount: 5, avgAmount: 10_000 });

        await fraudService.evaluateWithdrawal(1, 50_000); // 5x average, threshold is 4x

        expect(fraudRepository.createFlag).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: "seller", entityId: 1, ruleCode: "withdrawal_outlier", severity: "high" })
        );
    });

    it("does not flag a withdrawal within normal range", async () => {
        fraudRepository.getSellerPriorWithdrawalStats.mockResolvedValue({ priorCount: 5, avgAmount: 10_000 });

        await fraudService.evaluateWithdrawal(1, 15_000);

        expect(fraudRepository.createFlag).not.toHaveBeenCalled();
    });
});

describe("fraud.service.resolveFlag", () => {
    it("rejects an invalid resolution status", async () => {
        await expect(fraudService.resolveFlag(1, "bogus", 9)).rejects.toThrow("Invalid resolution status");
    });

    it("accepts dismissed/confirmed and delegates to the repository", async () => {
        fraudRepository.resolve.mockResolvedValue(undefined);
        await fraudService.resolveFlag(1, "confirmed", 9);
        expect(fraudRepository.resolve).toHaveBeenCalledWith(1, "confirmed", 9);
    });
});
