jest.mock("../../../src/modules/store/store.repository");

const storeRepository = require("../../../src/modules/store/store.repository");
const storeService = require("../../../src/modules/store/store.service");

describe("store.service.getPublicStoreProfile", () => {
    it("rejects when no store matches the slug", async () => {
        storeRepository.findPublicBySlug.mockResolvedValue(undefined);

        await expect(storeService.getPublicStoreProfile("no-such-store")).rejects.toThrow(
            "Store not found."
        );
    });

    it("returns the repository row unchanged when found", async () => {
        const row = {
            user_id: 42,
            store_name: "Mama Ntilie's Kitchen",
            store_slug: "mama-ntilies-kitchen",
            store_description: "Home-cooked meals",
            store_tagline: "Fresh flavors, delivered fast",
            store_logo: "https://cdn/logo.png",
            store_banner: "https://cdn/banner.png",
            store_theme: "coral",
            social_instagram: "@mamantilie",
            social_facebook: "facebook.com/mamantilie",
            social_whatsapp: "255700000000",
            country: "Tanzania",
            region: "Dar es Salaam",
            city: "Kinondoni",
            store_type_name: "Grocery",
            is_verified: 1,
            created_at: "2024-03-10T00:00:00.000Z",
            identity_verified: 1,
            average_rating: "4.6",
            review_count: 18
        };
        storeRepository.findPublicBySlug.mockResolvedValue(row);

        const result = await storeService.getPublicStoreProfile("mama-ntilies-kitchen");

        expect(storeRepository.findPublicBySlug).toHaveBeenCalledWith("mama-ntilies-kitchen");
        expect(result).toEqual(row);
    });
});

describe("store.service.getStoreCollections (Phase 7C)", () => {
    it("delegates to the repository and returns its result unchanged", async () => {
        const collections = [{ id: 1, name: "New Arrivals", products: [{ id: 5, name: "Widget" }] }];
        storeRepository.findCollectionsBySlug.mockResolvedValue(collections);

        const result = await storeService.getStoreCollections("mama-ntilies-kitchen");

        expect(storeRepository.findCollectionsBySlug).toHaveBeenCalledWith("mama-ntilies-kitchen");
        expect(result).toEqual(collections);
    });

    it("returns an empty array for an unknown slug rather than throwing", async () => {
        storeRepository.findCollectionsBySlug.mockResolvedValue([]);

        await expect(storeService.getStoreCollections("no-such-store")).resolves.toEqual([]);
    });
});
