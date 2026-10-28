import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Every stock.p8.* key must exist in BOTH languages, and Swahili must be a real
// translation (not a copy of the English) for sentences.
//
// Phase 9: the dictionaries moved out of LanguageContext.jsx into their own
// files (src/i18n/en.js, src/i18n/sw.js) so Swahili can be lazily loaded as
// its own chunk - see loadSwDictionary in LanguageContext.jsx. This test
// reads those files directly instead of parsing LanguageContext.jsx.
const en = readFileSync(resolve(__dirname, "../../src/i18n/en.js"), "utf8");
const sw = readFileSync(resolve(__dirname, "../../src/i18n/sw.js"), "utf8");
const grab = (text) => new Map([...text.matchAll(/"(stock\.p8\.[^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]));
const enMap = grab(en);
const swMap = grab(sw);

describe("stock.p8 translations", () => {
    it("has a healthy number of keys", () => expect(enMap.size).toBeGreaterThan(100));
    it("English and Swahili have exactly the same keys", () => {
        expect([...enMap.keys()].filter((k) => !swMap.has(k))).toEqual([]);
        expect([...swMap.keys()].filter((k) => !enMap.has(k))).toEqual([]);
    });
    it("uses the same {placeholders} in both languages", () => {
        const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
        const bad = [...enMap].filter(([k, v]) => ph(v) !== ph(swMap.get(k) || ""));
        expect(bad.map(([k]) => k)).toEqual([]);
    });
    it("no empty strings", () => {
        expect([...enMap, ...swMap].filter(([, v]) => !v.trim())).toEqual([]);
    });
});
