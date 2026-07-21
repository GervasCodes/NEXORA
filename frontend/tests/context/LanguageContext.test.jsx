import { describe, it, expect } from "vitest";
import { DICTIONARY, LANGUAGES } from "../../src/context/LanguageContext";

// Regression coverage for Phase 8 (Legal & Translation Review): "en" is the
// fallback dictionary (see the `t()` fallback chain in LanguageContext.jsx),
// so every key defined there must also exist in every other language with
// matching {placeholder} tokens, or a translation can silently fall back to
// English (missing key) or break interpolation (mismatched placeholders)
// without any test failing. This test would have caught the incomplete
// "Nataka ku" Swahili fragment found during that review.
describe("LanguageContext DICTIONARY parity", () => {
    const placeholders = (str) => (String(str).match(/\{[^}]+\}/g) || []).sort().join(",");
    const enDict = DICTIONARY.en;
    const enKeys = Object.keys(enDict);

    const otherLanguages = LANGUAGES.map((l) => l.code).filter((code) => code !== "en");

    it("LANGUAGES lists a code for every dictionary entry and vice versa", () => {
        expect(Object.keys(DICTIONARY).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    });

    for (const code of otherLanguages) {
        describe(`language "${code}"`, () => {
            const dict = DICTIONARY[code];

            it("defines every key that \"en\" defines", () => {
                const missing = enKeys.filter((key) => !(key in dict));
                expect(missing).toEqual([]);
            });

            it("defines no keys beyond what \"en\" defines", () => {
                const extra = Object.keys(dict).filter((key) => !(key in enDict));
                expect(extra).toEqual([]);
            });

            it("matches \"en\"'s {placeholder} tokens for every shared key", () => {
                const mismatches = enKeys
                    .filter((key) => key in dict)
                    .filter((key) => placeholders(enDict[key]) !== placeholders(dict[key]))
                    .map((key) => ({ key, en: placeholders(enDict[key]), [code]: placeholders(dict[key]) }));
                expect(mismatches).toEqual([]);
            });

            it("has no empty or whitespace-only translated strings", () => {
                const blank = Object.entries(dict)
                    .filter(([, value]) => typeof value === "string" && value.trim() === "")
                    .map(([key]) => key);
                expect(blank).toEqual([]);
            });
        });
    }
});
