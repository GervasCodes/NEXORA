// Service-level tests for modules that had none: wishlist, productQuestion, sellerSavedFilter, pickupPoint, storeType.
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/wishlist/wishlist.repository");
jest.mock("../../src/modules/product/product.repository");
jest.mock("../../src/modules/service/service.repository");
jest.mock("../../src/modules/productQuestion/productQuestion.repository");
jest.mock("../../src/modules/notification/notification.service");
jest.mock("../../src/modules/sellerSavedFilter/sellerSavedFilter.repository");
jest.mock("../../src/modules/pickupPoint/pickupPoint.repository");
jest.mock("../../src/modules/storeType/storeType.repository");

const wishlistRepository = require("../../src/modules/wishlist/wishlist.repository");
const productRepository = require("../../src/modules/product/product.repository");
const serviceRepository = require("../../src/modules/service/service.repository");
const questionRepository = require("../../src/modules/productQuestion/productQuestion.repository");
const notificationService = require("../../src/modules/notification/notification.service");
const filterRepository = require("../../src/modules/sellerSavedFilter/sellerSavedFilter.repository");
const pickupRepository = require("../../src/modules/pickupPoint/pickupPoint.repository");
const storeTypeRepository = require("../../src/modules/storeType/storeType.repository");

const wishlist = require("../../src/modules/wishlist/wishlist.service");
const questions = require("../../src/modules/productQuestion/productQuestion.service");
const savedFilters = require("../../src/modules/sellerSavedFilter/sellerSavedFilter.service");
const pickup = require("../../src/modules/pickupPoint/pickupPoint.service");
const storeTypes = require("../../src/modules/storeType/storeType.service");

beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue();
});

describe("wishlist", () => {
    it("saves an existing product for the user", async () => {
        productRepository.findById.mockResolvedValue({ id: 5 });
        await wishlist.addProduct(1, 5);
        expect(wishlistRepository.add).toHaveBeenCalledWith(1, { productId: 5 });
    });
    it("refuses to save a product or service that does not exist", async () => {
        productRepository.findById.mockResolvedValue(undefined);
        serviceRepository.findById.mockResolvedValue(undefined);
        await expect(wishlist.addProduct(1, 5)).rejects.toThrow("Product not found");
        await expect(wishlist.addService(1, 6)).rejects.toThrow("Service not found");
        expect(wishlistRepository.add).not.toHaveBeenCalled();
    });
    it("removal is always scoped to the calling user", async () => {
        await wishlist.removeProduct(1, 5);
        await wishlist.removeService(1, 6);
        expect(wishlistRepository.remove).toHaveBeenNthCalledWith(1, 1, { productId: 5 });
        expect(wishlistRepository.remove).toHaveBeenNthCalledWith(2, 1, { serviceId: 6 });
    });
});

describe("productQuestion", () => {
    const product = { id: 5, seller_id: 9, name: "Soap", slug: "soap" };
    it("asking notifies the seller and returns the stored question", async () => {
        productRepository.findById.mockResolvedValue(product);
        questionRepository.create.mockResolvedValue(77);
        questionRepository.findById.mockResolvedValue({ id: 77 });
        await expect(questions.ask(5, 1, "Is it organic?")).resolves.toEqual({ id: 77 });
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 9 }));
    });
    it("a failing notification never fails the question", async () => {
        productRepository.findById.mockResolvedValue(product);
        questionRepository.create.mockResolvedValue(77);
        questionRepository.findById.mockResolvedValue({ id: 77 });
        notificationService.notify.mockRejectedValue(new Error("push down"));
        await expect(questions.ask(5, 1, "Hi?")).resolves.toEqual({ id: 77 });
    });
    it("cannot ask about a product that does not exist", async () => {
        productRepository.findById.mockResolvedValue(undefined);
        await expect(questions.ask(5, 1, "Hi?")).rejects.toThrow("Product not found");
        expect(questionRepository.create).not.toHaveBeenCalled();
    });
    it("only the product's own seller can answer", async () => {
        questionRepository.findById.mockResolvedValue({ id: 77, product_id: 5, user_id: 1 });
        productRepository.findById.mockResolvedValue(product);
        await expect(questions.answer(123, 77, "Yes")).rejects.toThrow("Question not found");
        expect(questionRepository.setAnswer).not.toHaveBeenCalled();
        await questions.answer(9, 77, "Yes");
        expect(questionRepository.setAnswer).toHaveBeenCalledWith(77, "Yes");
        expect(notificationService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
    });
});

describe("sellerSavedFilter", () => {
    it("accepts only the known page keys", async () => {
        await expect(savedFilters.list(1, "anything")).rejects.toThrow("Invalid page");
        await expect(savedFilters.create(1, "x", "n", {})).rejects.toThrow("Invalid page");
        expect(filterRepository.findByPage).not.toHaveBeenCalled();
    });
    it("trims the name and requires one", async () => {
        filterRepository.create.mockResolvedValue(3);
        await expect(savedFilters.create(1, "seller_orders", "  Late  ", { a: 1 })).resolves.toEqual({ id: 3, name: "Late", filters: { a: 1 } });
        await expect(savedFilters.create(1, "seller_orders", "   ", {})).rejects.toThrow("Name is required");
    });
    it("deleting another seller's filter is 'not found' (the delete is scoped to the seller)", async () => {
        filterRepository.remove.mockResolvedValue(0);
        await expect(savedFilters.remove(2, 3)).rejects.toThrow("Saved filter not found");
        expect(filterRepository.remove).toHaveBeenCalledWith(2, 3);
        filterRepository.remove.mockResolvedValue(1);
        await expect(savedFilters.remove(1, 3)).resolves.toBeUndefined();
    });
});

describe("pickupPoint", () => {
    it("requires name, address, city and region", async () => {
        await expect(pickup.create({ name: "A", address: "B", city: "C" })).rejects.toThrow("required");
        expect(pickupRepository.create).not.toHaveBeenCalled();
    });
    it("rejects an inactive or missing point at checkout, accepts an active one", async () => {
        pickupRepository.findById.mockResolvedValueOnce({ id: 1, is_active: 0 });
        await expect(pickup.assertActiveAndGetAddress(1)).rejects.toThrow("no longer available");
        pickupRepository.findById.mockResolvedValueOnce(undefined);
        await expect(pickup.assertActiveAndGetAddress(2)).rejects.toThrow("no longer available");
        pickupRepository.findById.mockResolvedValueOnce({ id: 3, is_active: 1, address: "X" });
        await expect(pickup.assertActiveAndGetAddress(3)).resolves.toMatchObject({ address: "X" });
    });
    it("updating a missing point fails", async () => {
        pickupRepository.findById.mockResolvedValue(undefined);
        await expect(pickup.update(9, { name: "n" })).rejects.toThrow("Pickup point not found");
    });
});

describe("storeType", () => {
    it("derives a slug and refuses a duplicate name", async () => {
        storeTypeRepository.findBySlug.mockResolvedValueOnce(undefined);
        storeTypeRepository.create.mockResolvedValue(4);
        await expect(storeTypes.createStoreType("Fashion & Beauty")).resolves.toEqual({ storeTypeId: 4, slug: "fashion--beauty" });
        storeTypeRepository.findBySlug.mockResolvedValueOnce({ id: 1 });
        await expect(storeTypes.createStoreType("Fashion & Beauty")).rejects.toThrow("already exists");
    });
    it("renaming to the type's own slug is allowed, to another type's slug is not", async () => {
        storeTypeRepository.findById.mockResolvedValue({ id: 2 });
        storeTypeRepository.findBySlug.mockResolvedValueOnce({ id: 2 });
        await expect(storeTypes.updateStoreType(2, "Same")).resolves.toBeUndefined();
        storeTypeRepository.findBySlug.mockResolvedValueOnce({ id: 8 });
        await expect(storeTypes.updateStoreType(2, "Other")).rejects.toThrow("already exists");
    });
    it("activating or deactivating a missing type fails", async () => {
        storeTypeRepository.findById.mockResolvedValue(undefined);
        await expect(storeTypes.setStoreTypeActive(1, false)).rejects.toThrow("Store type not found");
    });
});
