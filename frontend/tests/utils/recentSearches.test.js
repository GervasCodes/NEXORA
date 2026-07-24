import { describe, it, expect, beforeEach } from "vitest";
import {
    getRecentSearches,
    addRecentSearch,
    clearRecentSearches
} from "../../src/utils/recentSearches";

describe("recentSearches", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("returns an empty list when nothing has been searched yet", () => {
        expect(getRecentSearches()).toEqual([]);
    });

    it("adds a search term and persists it", () => {
        addRecentSearch("running shoes");
        expect(getRecentSearches()).toEqual(["running shoes"]);
    });

    it("puts the most recent search first", () => {
        addRecentSearch("phones");
        addRecentSearch("laptops");
        expect(getRecentSearches()).toEqual(["laptops", "phones"]);
    });

    it("de-duplicates case-insensitively, moving the repeated term to the front", () => {
        addRecentSearch("Phones");
        addRecentSearch("laptops");
        addRecentSearch("phones");
        expect(getRecentSearches()).toEqual(["phones", "laptops"]);
    });

    it("ignores blank/whitespace-only terms", () => {
        addRecentSearch("   ");
        addRecentSearch("");
        expect(getRecentSearches()).toEqual([]);
    });

    it("trims whitespace before storing", () => {
        addRecentSearch("  headphones  ");
        expect(getRecentSearches()).toEqual(["headphones"]);
    });

    it("caps the list at 8 entries, dropping the oldest", () => {
        for (let i = 1; i <= 10; i++) addRecentSearch(`term ${i}`);
        const result = getRecentSearches();
        expect(result).toHaveLength(8);
        expect(result[0]).toBe("term 10");
        expect(result).not.toContain("term 1");
        expect(result).not.toContain("term 2");
    });

    it("clears all recent searches", () => {
        addRecentSearch("phones");
        clearRecentSearches();
        expect(getRecentSearches()).toEqual([]);
    });

    it("recovers gracefully from corrupted storage instead of throwing", () => {
        window.localStorage.setItem("nexora_recent_searches", "not valid json{{{");
        expect(getRecentSearches()).toEqual([]);
        expect(() => addRecentSearch("phones")).not.toThrow();
    });
});
