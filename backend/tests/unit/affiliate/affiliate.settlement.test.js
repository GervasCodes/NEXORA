jest.mock("../../../src/config/db", () => require("../../helpers/mockDb"));
jest.mock("../../../src/modules/affiliate/affiliate.repository");
jest.mock("../../../src/modules/buyerWallet/buyerWallet.repository");
jest.mock("../../../src/modules/order/order.repository");

const db = require("../../../src/config/db");
const affiliateRepository = require("../../../src/modules/affiliate/affiliate.repository");
const buyerWalletRepository = require("../../../src/modules/buyerWallet/buyerWallet.repository");
const orderRepository = require("../../../src/modules/order/order.repository");
const affiliateService = require("../../../src/modules/affiliate/affiliate.service");

const connection = db.__mockConnection;

describe("affiliate.service.attributeOrder (Phase 6)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        affiliateRepository.findClickByToken.mockResolvedValue({
            affiliate_user_id: 9, created_at: new Date(), click_token: "tok"
        });
        affiliateRepository.findByUserId.mockResolvedValue({ user_id: 9, status: "active", commission_rate: "0.05" });
        affiliateRepository.hasConversionForBuyerClick.mockResolvedValue(false);
        orderRepository.findOrderById.mockResolvedValue({ id: 55 });
        affiliateRepository.findGoodsSubtotal.mockResolvedValue(1000);
    });

    it("records a pending conversion on the goods subtotal and does not credit the wallet", async () => {
        await affiliateService.attributeOrder(55, 20, "tok");

        expect(affiliateRepository.createPendingConversion).toHaveBeenCalledWith({
            affiliateUserId: 9, orderId: 55, commissionAmount: 50, clickToken: "tok"
        });
        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
    });

    it("skips a second conversion for the same buyer and click token", async () => {
        affiliateRepository.hasConversionForBuyerClick.mockResolvedValue(true);

        await affiliateService.attributeOrder(55, 20, "tok");

        expect(affiliateRepository.createPendingConversion).not.toHaveBeenCalled();
    });

    it("treats a duplicate order_id insert as a no-op rather than an error", async () => {
        affiliateRepository.createPendingConversion.mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));

        await expect(affiliateService.attributeOrder(55, 20, "tok")).resolves.toBeUndefined();
    });
});

describe("affiliate.service settlement helpers (Phase 6)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        buyerWalletRepository.incrementBalance.mockResolvedValue(150);
    });

    it("pays a pending conversion into the wallet exactly once", async () => {
        affiliateRepository.findConversionForUpdate
            .mockResolvedValueOnce({ id: 1, status: "pending", affiliate_user_id: 9, order_id: 55, commission_amount: "50.00" })
            .mockResolvedValueOnce({ id: 1, status: "paid", affiliate_user_id: 9, order_id: 55, commission_amount: "50.00" });

        expect(await affiliateService.releaseConversionOn(1, connection)).toBe(true);
        expect(buyerWalletRepository.incrementBalance).toHaveBeenCalledWith(9, 50, connection);
        expect(affiliateRepository.setConversionStatus).toHaveBeenCalledWith(1, "paid", connection);

        expect(await affiliateService.releaseConversionOn(1, connection)).toBe(false);
        expect(buyerWalletRepository.incrementBalance).toHaveBeenCalledTimes(1);
    });

    it("takes back a paid commission from the wallet when the order is reversed", async () => {
        affiliateRepository.findConversionForUpdate.mockResolvedValue({
            id: 2, status: "paid", affiliate_user_id: 9, order_id: 56, commission_amount: "50.00"
        });

        expect(await affiliateService.reverseConversionOn(2, connection)).toBe(true);
        expect(buyerWalletRepository.incrementBalance).toHaveBeenCalledWith(9, -50, connection);
        expect(affiliateRepository.setConversionStatus).toHaveBeenCalledWith(2, "reversed", connection);
    });

    it("reverses a pending conversion without touching the wallet", async () => {
        affiliateRepository.findConversionForUpdate.mockResolvedValue({
            id: 3, status: "pending", affiliate_user_id: 9, order_id: 57, commission_amount: "50.00"
        });

        expect(await affiliateService.reverseConversionOn(3, connection)).toBe(true);
        expect(buyerWalletRepository.incrementBalance).not.toHaveBeenCalled();
        expect(affiliateRepository.setConversionStatus).toHaveBeenCalledWith(3, "reversed", connection);
    });
});
