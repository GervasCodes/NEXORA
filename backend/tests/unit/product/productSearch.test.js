const {
    buildProductSearchPlan,
    toBooleanPrefixQuery,
    MIN_FULLTEXT_CHARS
} = require("../../../src/utils/productSearch");

describe("productSearch.buildProductSearchPlan", () => {
    it("returns mode 'none' when there is no search term", () => {
        expect(buildProductSearchPlan(undefined)).toEqual({ mode: "none" });
        expect(buildProductSearchPlan(null)).toEqual({ mode: "none" });
        expect(buildProductSearchPlan("")).toEqual({ mode: "none" });
        expect(buildProductSearchPlan("   ")).toEqual({ mode: "none" });
    });

    it("falls back to LIKE mode below the FULLTEXT minimum length", () => {
        expect(MIN_FULLTEXT_CHARS).toBe(3);

        const plan = buildProductSearchPlan("la");
        expect(plan.mode).toBe("like");
        expect(plan.raw).toBe("la");
    });

    it("uses FULLTEXT boolean mode at the minimum length and above", () => {
        const plan = buildProductSearchPlan("lap");
        expect(plan.mode).toBe("fulltext");
        expect(plan.raw).toBe("lap");
        expect(plan.booleanQuery).toBe("lap*");
    });

    it("trims surrounding whitespace before deciding the mode", () => {
        const plan = buildProductSearchPlan("  laptop  ");
        expect(plan.mode).toBe("fulltext");
        expect(plan.raw).toBe("laptop");
    });

    it("turns every word into its own prefix term, for multi-word queries", () => {
        const plan = buildProductSearchPlan("blue running shoes");
        expect(plan.mode).toBe("fulltext");
        expect(plan.booleanQuery).toBe("blue* running* shoes*");
    });

    it("strips FULLTEXT boolean-mode operators out of user input", () => {
        // Without stripping, a search like `+free -tax` would be parsed by
        // MySQL as boolean operators ("must contain free, must not contain
        // tax") instead of literal text - surprising and hard to reproduce
        // behavior for an end user who just typed those characters.
        const plan = buildProductSearchPlan('+free" -tax<>()~@*');
        expect(plan.mode).toBe("fulltext");
        expect(plan.booleanQuery).toBe("free* tax*");
    });

    it("falls back to LIKE mode if a search is only operator characters", () => {
        const plan = buildProductSearchPlan("+-<>()~*\"@");
        expect(plan.mode).toBe("like");
    });

    describe("toBooleanPrefixQuery", () => {
        it("appends a trailing wildcard to a single word", () => {
            expect(toBooleanPrefixQuery("phone")).toBe("phone*");
        });

        it("collapses repeated whitespace between words", () => {
            expect(toBooleanPrefixQuery("blue   shoes")).toBe("blue* shoes*");
        });
    });
});
