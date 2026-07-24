const {
    parsePrice,
    parsePriceRange,
    parseSellerId,
    parseLocation,
    parseMinRating,
    buildPriceSellerConditions,
    buildLocationRatingConditions
} = require("../../../src/utils/productFilters");

describe("productFilters.parsePrice", () => {
    it("returns null for missing/empty input", () => {
        expect(parsePrice(undefined)).toBeNull();
        expect(parsePrice(null)).toBeNull();
        expect(parsePrice("")).toBeNull();
    });

    it("returns null for non-numeric input", () => {
        expect(parsePrice("abc")).toBeNull();
        expect(parsePrice("12abc")).toBeNull();
    });

    it("returns null for negative numbers", () => {
        expect(parsePrice("-5")).toBeNull();
        expect(parsePrice(-1)).toBeNull();
    });

    it("returns null for non-finite input", () => {
        expect(parsePrice("Infinity")).toBeNull();
        expect(parsePrice(NaN)).toBeNull();
    });

    it("parses valid string and number input, including zero", () => {
        expect(parsePrice("1000")).toBe(1000);
        expect(parsePrice("19.99")).toBe(19.99);
        expect(parsePrice(0)).toBe(0);
        expect(parsePrice("0")).toBe(0);
    });
});

describe("productFilters.parsePriceRange", () => {
    it("returns { min: null, max: null } when neither is given", () => {
        expect(parsePriceRange(undefined, undefined)).toEqual({ min: null, max: null });
    });

    it("returns just the side that was given", () => {
        expect(parsePriceRange("1000", undefined)).toEqual({ min: 1000, max: null });
        expect(parsePriceRange(undefined, "5000")).toEqual({ min: null, max: 5000 });
    });

    it("drops invalid sides independently", () => {
        expect(parsePriceRange("not-a-number", "5000")).toEqual({ min: null, max: 5000 });
        expect(parsePriceRange("1000", "not-a-number")).toEqual({ min: 1000, max: null });
    });

    it("returns both sides when min <= max", () => {
        expect(parsePriceRange("1000", "5000")).toEqual({ min: 1000, max: 5000 });
        expect(parsePriceRange("1000", "1000")).toEqual({ min: 1000, max: 1000 });
    });

    it("swaps min/max when they're given in the wrong order", () => {
        expect(parsePriceRange("5000", "1000")).toEqual({ min: 1000, max: 5000 });
    });
});

describe("productFilters.parseSellerId", () => {
    it("returns null for missing/empty input", () => {
        expect(parseSellerId(undefined)).toBeNull();
        expect(parseSellerId(null)).toBeNull();
        expect(parseSellerId("")).toBeNull();
    });

    it("returns null for non-integer, zero, or negative input", () => {
        expect(parseSellerId("abc")).toBeNull();
        expect(parseSellerId("1.5")).toBeNull();
        expect(parseSellerId("0")).toBeNull();
        expect(parseSellerId("-3")).toBeNull();
    });

    it("parses a valid positive integer id", () => {
        expect(parseSellerId("42")).toBe(42);
        expect(parseSellerId(42)).toBe(42);
    });
});

describe("productFilters.buildPriceSellerConditions", () => {
    it("returns empty conditions/params when nothing is set", () => {
        expect(buildPriceSellerConditions({ minPrice: null, maxPrice: null, sellerId: null }))
            .toEqual({ conditions: [], params: [] });
    });

    it("builds a min-price condition against the effective (discounted) price", () => {
        const result = buildPriceSellerConditions({ minPrice: 1000, maxPrice: null, sellerId: null });
        expect(result.conditions).toEqual(["COALESCE(p.discount_price, p.price) >= ?"]);
        expect(result.params).toEqual([1000]);
    });

    it("builds a max-price condition", () => {
        const result = buildPriceSellerConditions({ minPrice: null, maxPrice: 5000, sellerId: null });
        expect(result.conditions).toEqual(["COALESCE(p.discount_price, p.price) <= ?"]);
        expect(result.params).toEqual([5000]);
    });

    it("builds a seller condition", () => {
        const result = buildPriceSellerConditions({ minPrice: null, maxPrice: null, sellerId: 7 });
        expect(result.conditions).toEqual(["p.seller_id = ?"]);
        expect(result.params).toEqual([7]);
    });

    it("combines all three filters in a stable order: min, max, seller", () => {
        const result = buildPriceSellerConditions({ minPrice: 1000, maxPrice: 5000, sellerId: 7 });
        expect(result.conditions).toEqual([
            "COALESCE(p.discount_price, p.price) >= ?",
            "COALESCE(p.discount_price, p.price) <= ?",
            "p.seller_id = ?"
        ]);
        expect(result.params).toEqual([1000, 5000, 7]);
    });
});

describe("productFilters.parseLocation", () => {
    it("returns null for missing/undefined input", () => {
        expect(parseLocation(undefined)).toBeNull();
        expect(parseLocation(null)).toBeNull();
    });

    it("returns null for an empty or whitespace-only string", () => {
        expect(parseLocation("")).toBeNull();
        expect(parseLocation("   ")).toBeNull();
    });

    it("trims surrounding whitespace on a valid value", () => {
        expect(parseLocation("  Dar es Salaam  ")).toBe("Dar es Salaam");
    });

    it("passes through an already-clean value unchanged", () => {
        expect(parseLocation("Arusha")).toBe("Arusha");
    });
});

describe("productFilters.parseMinRating", () => {
    it("returns null for missing/empty input", () => {
        expect(parseMinRating(undefined)).toBeNull();
        expect(parseMinRating(null)).toBeNull();
        expect(parseMinRating("")).toBeNull();
    });

    it("returns null for non-integer input", () => {
        expect(parseMinRating("abc")).toBeNull();
        expect(parseMinRating("3.5")).toBeNull();
    });

    it("returns null for values outside the 1-5 range", () => {
        expect(parseMinRating("0")).toBeNull();
        expect(parseMinRating("-1")).toBeNull();
        expect(parseMinRating("6")).toBeNull();
    });

    it("parses each valid whole rating 1 through 5", () => {
        expect(parseMinRating("1")).toBe(1);
        expect(parseMinRating("4")).toBe(4);
        expect(parseMinRating(5)).toBe(5);
    });
});

describe("productFilters.buildLocationRatingConditions", () => {
    it("returns empty conditions/params when nothing is set", () => {
        expect(buildLocationRatingConditions({ region: null, minRating: null }))
            .toEqual({ conditions: [], params: [] });
    });

    it("builds a region condition", () => {
        const result = buildLocationRatingConditions({ region: "Dar es Salaam", minRating: null });
        expect(result.conditions).toEqual(["sp.region = ?"]);
        expect(result.params).toEqual(["Dar es Salaam"]);
    });

    it("builds a minimum-rating condition using a correlated subquery, not an alias", () => {
        const result = buildLocationRatingConditions({ region: null, minRating: 4 });
        expect(result.conditions).toEqual([
            "(SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) >= ?"
        ]);
        expect(result.params).toEqual([4]);
    });

    it("combines both filters in a stable order: region, rating", () => {
        const result = buildLocationRatingConditions({ region: "Arusha", minRating: 3 });
        expect(result.conditions).toEqual([
            "sp.region = ?",
            "(SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) >= ?"
        ]);
        expect(result.params).toEqual(["Arusha", 3]);
    });
});
