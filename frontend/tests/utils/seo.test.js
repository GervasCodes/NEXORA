import { describe, it, expect } from "vitest";
import { SITE_URL, buildHreflangLinks, readLangParam, HOME_TITLE, HOME_DESCRIPTION, DEFAULT_DESCRIPTION } from "../../src/utils/seo";

describe("readLangParam", () => {
    it("returns sw / en when asked for, otherwise null", () => {
        expect(readLangParam("?lang=sw")).toBe("sw");
        expect(readLangParam("?a=1&lang=en")).toBe("en");
        expect(readLangParam("?lang=fr")).toBeNull();
        expect(readLangParam("")).toBeNull();
    });
});

describe("buildHreflangLinks", () => {
    it("links English (clean URL + x-default) and Kiswahili (?lang=sw)", () => {
        expect(buildHreflangLinks("/products/")).toEqual([
            { hreflang: "en", href: `${SITE_URL}/products` },
            { hreflang: "sw", href: `${SITE_URL}/products?lang=sw` },
            { hreflang: "x-default", href: `${SITE_URL}/products` }
        ]);
    });

    it("handles the root path", () => {
        expect(buildHreflangLinks("/")[1].href).toBe(`${SITE_URL}/?lang=sw`);
    });
});

describe("site-wide copy", () => {
    it("names Tanzania so local searches can match", () => {
        expect(HOME_TITLE).toMatch(/Tanzania/);
        expect(HOME_DESCRIPTION).toMatch(/Tanzania/);
        expect(DEFAULT_DESCRIPTION).toMatch(/Tanzania/);
    });

    it("keeps the meta description a sensible length", () => {
        expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160);
    });
});
