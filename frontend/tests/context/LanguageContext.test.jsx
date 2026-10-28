import { describe, it, expect } from "vitest";
import { LANGUAGES } from "../../src/context/LanguageContext";
import en from "../../src/i18n/en";
import sw from "../../src/i18n/sw";

// Regression coverage for Phase 8 (Legal & Translation Review): "en" is the
// fallback dictionary (see the `t()` fallback chain in LanguageContext.jsx),
// so every key defined there must also exist in every other language with
// matching {placeholder} tokens, or a translation can silently fall back to
// English (missing key) or break interpolation (mismatched placeholders)
// without any test failing. This test would have caught the incomplete
// "Nataka ku" Swahili fragment found during that review.
//
// Phase 9: the dictionaries moved out of one DICTIONARY object in
// LanguageContext.jsx into their own files (src/i18n/en.js, src/i18n/sw.js)
// so Swahili can be a separate, lazily-loaded chunk - see the comment above
// loadSwDictionary in LanguageContext.jsx. This test imports those files
// directly instead of a DICTIONARY export, which no longer exists.
describe("i18n dictionary parity", () => {
    const placeholders = (str) => (String(str).match(/\{[^}]+\}/g) || []).sort().join(",");
    const DICTIONARIES = { en, sw };
    const enKeys = Object.keys(en);

    const otherLanguages = LANGUAGES.map((l) => l.code).filter((code) => code !== "en");

    it("LANGUAGES lists a code for every dictionary file and vice versa", () => {
        expect(Object.keys(DICTIONARIES).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    });

    for (const code of otherLanguages) {
        describe(`language "${code}"`, () => {
            const dict = DICTIONARIES[code];

            it("defines every key that \"en\" defines", () => {
                const missing = enKeys.filter((key) => !(key in dict));
                expect(missing).toEqual([]);
            });

            it("defines no keys beyond what \"en\" defines", () => {
                const extra = Object.keys(dict).filter((key) => !(key in en));
                expect(extra).toEqual([]);
            });

            it("matches \"en\"'s {placeholder} tokens for every shared key", () => {
                const mismatches = enKeys
                    .filter((key) => key in dict)
                    .filter((key) => placeholders(en[key]) !== placeholders(dict[key]))
                    .map((key) => ({ key, en: placeholders(en[key]), [code]: placeholders(dict[key]) }));
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
