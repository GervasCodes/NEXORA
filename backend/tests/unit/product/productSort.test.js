const { VALID_SORTS, parseSort, buildOrderByClause } = require("../../../src/utils/productSort");

describe("productSort.VALID_SORTS", () => {
    it("lists exactly the four supported sort options", () => {
        expect(VALID_SORTS.sort()).toEqual(["newest", "price_high", "price_low", "rating"].sort());
    });
});

describe("productSort.parseSort", () => {
    it("returns null for missing/empty input", () => {
        expect(parseSort(undefined)).toBeNull();
        expect(parseSort(null)).toBeNull();
        expect(parseSort("")).toBeNull();
    });

    it("returns null for an unrecognized value", () => {
        expect(parseSort("popularity")).toBeNull();
        expect(parseSort("PRICE_LOW")).toBeNull();
        expect(parseSort("; DROP TABLE products;")).toBeNull();
    });

    it("returns each whitelisted value unchanged", () => {
        expect(parseSort("newest")).toBe("newest");
        expect(parseSort("price_low")).toBe("price_low");
        expect(parseSort("price_high")).toBe("price_high");
        expect(parseSort("rating")).toBe("rating");
    });
});

describe("productSort.buildOrderByClause", () => {
    it("defaults to newest-first when no sort and no active search", () => {
        expect(buildOrderByClause(null, false)).toBe("p.created_at DESC");
    });

    it("defaults to relevance-first when no sort but a search is active", () => {
        expect(buildOrderByClause(null, true)).toBe("relevance DESC, p.created_at DESC");
    });

    it("an explicit valid sort overrides the newest-first default", () => {
        expect(buildOrderByClause("price_low", false))
            .toBe("COALESCE(p.discount_price, p.price) ASC, p.created_at DESC");
    });

    it("an explicit valid sort overrides relevance even when a search is active", () => {
        expect(buildOrderByClause("price_high", true))
            .toBe("COALESCE(p.discount_price, p.price) DESC, p.created_at DESC");
    });

    it("builds the rating sort against the average_rating/review_count SELECT aliases", () => {
        expect(buildOrderByClause("rating", false))
            .toBe("average_rating DESC, review_count DESC, p.created_at DESC");
    });

    it("falls back to the relevance/newest default when given an invalid sort", () => {
        expect(buildOrderByClause("not-a-real-option", false)).toBe("p.created_at DESC");
        expect(buildOrderByClause("not-a-real-option", true)).toBe("relevance DESC, p.created_at DESC");
    });
});
