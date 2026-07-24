jest.mock("../../../src/modules/seller/seller.repository");
jest.mock("../../../src/modules/settings/settings.service");
jest.mock("../../../src/modules/notification/notification.service");
jest.mock("../../../src/modules/auth/auth.repository");
jest.mock("../../../src/modules/product/product.repository");
jest.mock("../../../src/utils/cloudinaryUpload");
jest.mock("../../../src/modules/payment/payment.service");

const sellerRepository = require("../../../src/modules/seller/seller.repository");
const settingsService = require("../../../src/modules/settings/settings.service");
const notificationService = require("../../../src/modules/notification/notification.service");
const authRepository = require("../../../src/modules/auth/auth.repository");
const productRepository = require("../../../src/modules/product/product.repository");
const { uploadToCloudinary } = require("../../../src/utils/cloudinaryUpload");
const paymentService = require("../../../src/modules/payment/payment.service");

const sellerService = require("../../../src/modules/seller/seller.service");

beforeEach(() => {
    notificationService.notify.mockResolvedValue(undefined);
});

describe("seller.service.uploadStoreLogo / uploadStoreBanner", () => {
    it("rejects when the user has no seller profile (logo)", async () => {
        sellerRepository.findByUserId.mockResolvedValue(undefined);
        await expect(sellerService.uploadStoreLogo(1, { buffer: Buffer.from("x") })).rejects.toThrow("Seller profile not found");
    });

    it("uploads and persists the logo URL", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ id: 10 });
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/logo.png" });

        const result = await sellerService.uploadStoreLogo(1, { buffer: Buffer.from("x") });

        expect(uploadToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), "seller/logos");
        expect(sellerRepository.updateLogo).toHaveBeenCalledWith(1, "https://cdn/logo.png");
        expect(result).toBe("https://cdn/logo.png");
    });

    it("rejects when the user has no seller profile (banner)", async () => {
        sellerRepository.findByUserId.mockResolvedValue(undefined);
        await expect(sellerService.uploadStoreBanner(1, { buffer: Buffer.from("x") })).rejects.toThrow("Seller profile not found");
    });

    it("uploads and persists the banner URL to the correct folder", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ id: 10 });
        uploadToCloudinary.mockResolvedValue({ secure_url: "https://cdn/banner.png" });

        const result = await sellerService.uploadStoreBanner(1, { buffer: Buffer.from("x") });

        expect(uploadToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), "seller/banners");
        expect(sellerRepository.updateBanner).toHaveBeenCalledWith(1, "https://cdn/banner.png");
        expect(result).toBe("https://cdn/banner.png");
    });
});

describe("seller.service.createSellerProfile", () => {
    it("rejects a duplicate seller profile for the same user", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ id: 1 });
        await expect(sellerService.createSellerProfile(1, { store_name: "My Store" })).rejects.toThrow(
            "Seller profile already exists."
        );
    });

    it("slugifies the store name: lowercased, spaces to hyphens, punctuation stripped", async () => {
        sellerRepository.findByUserId.mockResolvedValue(undefined);
        sellerRepository.create.mockResolvedValue(55);

        const result = await sellerService.createSellerProfile(1, {
            store_name: "  Mama Ntilie's Kitchen! ",
            store_description: "desc",
            store_type_id: 2
        });

        expect(sellerRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ store_slug: "mama-ntilies-kitchen" })
        );
        expect(result).toEqual({ sellerId: 55, storeSlug: "mama-ntilies-kitchen" });
    });
});

describe("seller.service.getSellerProfile / updateSellerProfile", () => {
    it("getSellerProfile rejects when no profile exists", async () => {
        sellerRepository.findByUserId.mockResolvedValue(undefined);
        await expect(sellerService.getSellerProfile(1)).rejects.toThrow("Seller profile not found.");
    });

    it("updateSellerProfile rejects when no profile exists", async () => {
        sellerRepository.findByUserId.mockResolvedValue(undefined);
        await expect(sellerService.updateSellerProfile(1, {})).rejects.toThrow("Seller profile not found.");
        expect(sellerRepository.update).not.toHaveBeenCalled();
    });

    it("updateSellerProfile updates then returns the fresh profile", async () => {
        sellerRepository.findByUserId
            .mockResolvedValueOnce({ id: 1, store_name: "Old" })
            .mockResolvedValueOnce({ id: 1, store_name: "New" });

        const result = await sellerService.updateSellerProfile(1, { store_name: "New" });

        expect(sellerRepository.update).toHaveBeenCalledWith(1, { store_name: "New" });
        expect(result).toEqual({ id: 1, store_name: "New" });
    });
});

describe("seller.service delivery agent roster", () => {
    it("getRoster delegates to the repository", async () => {
        sellerRepository.findRoster.mockResolvedValue([{ id: 1 }]);
        const result = await sellerService.getRoster(10);
        expect(sellerRepository.findRoster).toHaveBeenCalledWith(10);
        expect(result).toEqual([{ id: 1 }]);
    });

    it("addAgentToRoster rejects an unknown email", async () => {
        sellerRepository.findAgentByEmail.mockResolvedValue(undefined);
        await expect(sellerService.addAgentToRoster(10, "nobody@x.com")).rejects.toThrow(
            "No NEXORA user found with that email"
        );
    });

    it("addAgentToRoster rejects a user whose role isn't delivery_agent", async () => {
        sellerRepository.findAgentByEmail.mockResolvedValue({ id: 5, role: "buyer" });
        await expect(sellerService.addAgentToRoster(10, "buyer@x.com")).rejects.toThrow(
            "That email isn't registered as a delivery agent account"
        );
    });

    it("addAgentToRoster rejects an agent already in the roster", async () => {
        sellerRepository.findAgentByEmail.mockResolvedValue({ id: 5, role: "delivery_agent" });
        sellerRepository.isInRoster.mockResolvedValue(true);
        await expect(sellerService.addAgentToRoster(10, "agent@x.com")).rejects.toThrow(
            "That agent is already in your roster"
        );
        expect(sellerRepository.addToRoster).not.toHaveBeenCalled();
    });

    it("addAgentToRoster adds a valid, not-yet-added delivery agent", async () => {
        sellerRepository.findAgentByEmail.mockResolvedValue({
            id: 5, role: "delivery_agent", first_name: "A", last_name: "B", email: "agent@x.com"
        });
        sellerRepository.isInRoster.mockResolvedValue(false);

        const result = await sellerService.addAgentToRoster(10, "agent@x.com");

        expect(sellerRepository.addToRoster).toHaveBeenCalledWith(10, 5);
        expect(result).toEqual({ agent_id: 5, first_name: "A", last_name: "B", email: "agent@x.com" });
    });

    it("removeAgentFromRoster rejects when the agent wasn't in the roster", async () => {
        sellerRepository.removeFromRoster.mockResolvedValue(0);
        await expect(sellerService.removeAgentFromRoster(10, 5)).rejects.toThrow("That agent isn't in your roster");
    });

    it("removeAgentFromRoster succeeds when a row was removed", async () => {
        sellerRepository.removeFromRoster.mockResolvedValue(1);
        await expect(sellerService.removeAgentFromRoster(10, 5)).resolves.toBeUndefined();
    });
});

describe("seller.service collections (Phase 7C)", () => {
    it("getCollections delegates to the repository", async () => {
        sellerRepository.findCollections.mockResolvedValue([{ id: 1, name: "New Arrivals", product_count: 2 }]);
        const result = await sellerService.getCollections(10);
        expect(sellerRepository.findCollections).toHaveBeenCalledWith(10);
        expect(result).toEqual([{ id: 1, name: "New Arrivals", product_count: 2 }]);
    });

    it("createCollection creates then returns the new id and name", async () => {
        sellerRepository.createCollection.mockResolvedValue(7);
        const result = await sellerService.createCollection(10, "Bestsellers");
        expect(sellerRepository.createCollection).toHaveBeenCalledWith(10, "Bestsellers");
        expect(result).toEqual({ id: 7, name: "Bestsellers" });
    });

    it("deleteCollection rejects when nothing was deleted (not this seller's collection)", async () => {
        sellerRepository.deleteCollection.mockResolvedValue(0);
        await expect(sellerService.deleteCollection(10, 99)).rejects.toThrow("Collection not found");
    });

    it("deleteCollection succeeds when a row was removed", async () => {
        sellerRepository.deleteCollection.mockResolvedValue(1);
        await expect(sellerService.deleteCollection(10, 7)).resolves.toBeUndefined();
    });

    it("getCollectionProducts rejects when the collection isn't this seller's", async () => {
        sellerRepository.findCollectionById.mockResolvedValue(undefined);
        await expect(sellerService.getCollectionProducts(10, 99)).rejects.toThrow("Collection not found");
        expect(sellerRepository.findProductsInCollection).not.toHaveBeenCalled();
    });

    it("getCollectionProducts returns the collection's products once ownership is confirmed", async () => {
        sellerRepository.findCollectionById.mockResolvedValue({ id: 7, seller_id: 10 });
        sellerRepository.findProductsInCollection.mockResolvedValue([{ id: 1, name: "Widget" }]);
        const result = await sellerService.getCollectionProducts(10, 7);
        expect(sellerRepository.findProductsInCollection).toHaveBeenCalledWith(7);
        expect(result).toEqual([{ id: 1, name: "Widget" }]);
    });

    it("addProductToCollection rejects when the collection isn't this seller's", async () => {
        sellerRepository.findCollectionById.mockResolvedValue(undefined);
        await expect(sellerService.addProductToCollection(10, 99, 1)).rejects.toThrow("Collection not found");
    });

    it("addProductToCollection rejects a product that isn't in the seller's own catalog", async () => {
        sellerRepository.findCollectionById.mockResolvedValue({ id: 7, seller_id: 10 });
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 99 });
        await expect(sellerService.addProductToCollection(10, 7, 1)).rejects.toThrow("Product not found in your catalog");
        expect(sellerRepository.addProductToCollection).not.toHaveBeenCalled();
    });

    it("addProductToCollection rejects a product already in the collection", async () => {
        sellerRepository.findCollectionById.mockResolvedValue({ id: 7, seller_id: 10 });
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10 });
        sellerRepository.isProductInCollection.mockResolvedValue(true);
        await expect(sellerService.addProductToCollection(10, 7, 1)).rejects.toThrow(
            "That product is already in this collection"
        );
        expect(sellerRepository.addProductToCollection).not.toHaveBeenCalled();
    });

    it("addProductToCollection adds a valid, not-yet-added product", async () => {
        sellerRepository.findCollectionById.mockResolvedValue({ id: 7, seller_id: 10 });
        productRepository.findById.mockResolvedValue({ id: 1, seller_id: 10 });
        sellerRepository.isProductInCollection.mockResolvedValue(false);
        await sellerService.addProductToCollection(10, 7, 1);
        expect(sellerRepository.addProductToCollection).toHaveBeenCalledWith(7, 1);
    });

    it("removeProductFromCollection rejects when the collection isn't this seller's", async () => {
        sellerRepository.findCollectionById.mockResolvedValue(undefined);
        await expect(sellerService.removeProductFromCollection(10, 99, 1)).rejects.toThrow("Collection not found");
    });

    it("removeProductFromCollection rejects when the product wasn't in the collection", async () => {
        sellerRepository.findCollectionById.mockResolvedValue({ id: 7, seller_id: 10 });
        sellerRepository.removeProductFromCollection.mockResolvedValue(0);
        await expect(sellerService.removeProductFromCollection(10, 7, 1)).rejects.toThrow(
            "That product isn't in this collection"
        );
    });

    it("removeProductFromCollection succeeds when a row was removed", async () => {
        sellerRepository.findCollectionById.mockResolvedValue({ id: 7, seller_id: 10 });
        sellerRepository.removeProductFromCollection.mockResolvedValue(1);
        await expect(sellerService.removeProductFromCollection(10, 7, 1)).resolves.toBeUndefined();
    });
});

describe("seller.service.getAnalytics", () => {
    it("assembles totals/breakdown/sales/products/repeat-customers/commission into one numeric-safe payload", async () => {
        sellerRepository.getOrderTotals.mockResolvedValue({
            total_orders: "12", gross_sales: "50000.00", commission_paid: "5000.00", net_earnings: "45000.00"
        });
        sellerRepository.getOrderStatusBreakdown.mockResolvedValue([
            { status: "delivered", count: "8" },
            { status: "pending", count: "4" }
        ]);
        sellerRepository.getDailySales.mockResolvedValue([{ day: "2026-07-01", amount: "1000.00" }]);
        sellerRepository.getTopProducts.mockResolvedValue([
            { product_id: 1, name: "Widget", units_sold: "10", revenue: "10000.00" }
        ]);
        sellerRepository.getRepeatCustomerCount.mockResolvedValue("3");
        settingsService.getCommissionRate.mockResolvedValue(10);

        const result = await sellerService.getAnalytics(10);

        expect(result).toEqual({
            commissionRate: 10,
            totals: { totalOrders: 12, grossSales: 50000, commissionPaid: 5000, netEarnings: 45000 },
            statusBreakdown: { delivered: 8, pending: 4 },
            dailySales: [{ day: "2026-07-01", amount: 1000 }],
            topProducts: [{ product_id: 1, name: "Widget", units_sold: 10, revenue: 10000 }],
            repeatCustomers: 3
        });
    });
});

describe("seller.service verification fee / badge sync", () => {
    it("payVerificationFee rejects when there's no seller profile yet", async () => {
        sellerRepository.findByUserId.mockResolvedValue(undefined);
        await expect(sellerService.payVerificationFee(1, "0700000000")).rejects.toThrow(
            "Seller profile not found. Set up your store first."
        );
    });

    it("payVerificationFee rejects when the fee was already paid", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ verification_fee_paid: 1 });
        await expect(sellerService.payVerificationFee(1, "0700000000")).rejects.toThrow(
            "The verification fee has already been paid."
        );
    });

    it("payVerificationFee rejects without a phone number", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ verification_fee_paid: 0 });
        await expect(sellerService.payVerificationFee(1, null)).rejects.toThrow(
            "A mobile money phone number is required."
        );
    });

    it("payVerificationFee looks up the fee and kicks off payment via payment.service", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ verification_fee_paid: 0 });
        settingsService.getVerificationFee.mockResolvedValue(20000);
        paymentService.initiateVerificationFeePayment.mockResolvedValue({ status: "pending" });

        const result = await sellerService.payVerificationFee(1, "0700000000");

        expect(paymentService.initiateVerificationFeePayment).toHaveBeenCalledWith(1, "0700000000", 20000);
        expect(result).toEqual({ status: "pending" });
    });

    it("confirmVerificationFeePaid marks the fee paid then syncs the badge", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ is_verified: 0, verification_fee_paid: 1 });
        authRepository.findById.mockResolvedValue({ account_verification_status: "approved" });

        await sellerService.confirmVerificationFeePaid(1, 20000, "TXN-1");

        expect(sellerRepository.setVerificationFeePaid).toHaveBeenCalledWith(1, 20000, "TXN-1");
        expect(sellerRepository.setBadge).toHaveBeenCalledWith(1, true);
    });

    it("syncBadgeForSeller flips the badge on only when both approval AND fee payment are true", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ is_verified: 0, verification_fee_paid: 1 });
        authRepository.findById.mockResolvedValue({ account_verification_status: "approved" });

        const result = await sellerService.syncBadgeForSeller(1);

        expect(sellerRepository.setBadge).toHaveBeenCalledWith(1, true);
        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 1, type: "seller_verification" })
        );
        expect(result).toBe(true);
    });

    it("syncBadgeForSeller does not flip the badge when approved but the fee is unpaid", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ is_verified: 0, verification_fee_paid: 0 });
        authRepository.findById.mockResolvedValue({ account_verification_status: "approved" });

        const result = await sellerService.syncBadgeForSeller(1);

        expect(sellerRepository.setBadge).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });

    it("syncBadgeForSeller does not flip the badge when fee is paid but account isn't approved", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ is_verified: 0, verification_fee_paid: 1 });
        authRepository.findById.mockResolvedValue({ account_verification_status: "pending" });

        const result = await sellerService.syncBadgeForSeller(1);

        expect(sellerRepository.setBadge).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });

    it("syncBadgeForSeller is a no-op when the badge already matches the target state", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ is_verified: 1, verification_fee_paid: 1 });
        authRepository.findById.mockResolvedValue({ account_verification_status: "approved" });

        const result = await sellerService.syncBadgeForSeller(1);

        expect(sellerRepository.setBadge).not.toHaveBeenCalled();
        expect(notificationService.notify).not.toHaveBeenCalled();
        expect(result).toBe(true);
    });

    it("syncBadgeForSeller revokes an already-on badge when it no longer qualifies, without notifying", async () => {
        sellerRepository.findByUserId.mockResolvedValue({ is_verified: 1, verification_fee_paid: 0 });
        authRepository.findById.mockResolvedValue({ account_verification_status: "approved" });

        const result = await sellerService.syncBadgeForSeller(1);

        expect(sellerRepository.setBadge).toHaveBeenCalledWith(1, false);
        expect(notificationService.notify).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });
});
