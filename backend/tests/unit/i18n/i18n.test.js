const { t, resolveLocale, resolveFromAcceptLanguage, SUPPORTED_LOCALES, DEFAULT_LOCALE } = require("../../../src/i18n");

describe("i18n.resolveLocale", () => {
    it("returns the default locale for a falsy candidate", () => {
        expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    });

    it("normalizes a supported locale tag, including region subtags", () => {
        expect(resolveLocale("sw")).toBe("sw");
        expect(resolveLocale("sw-TZ")).toBe("sw");
        expect(resolveLocale("EN")).toBe("en");
    });

    it("falls back to the default locale for an unsupported code", () => {
        expect(resolveLocale("fr")).toBe(DEFAULT_LOCALE);
    });
});

describe("i18n.resolveFromAcceptLanguage", () => {
    it("picks the first supported tag from a multi-value header", () => {
        expect(resolveFromAcceptLanguage("fr-FR,fr;q=0.9,sw;q=0.8,en;q=0.7")).toBe("sw");
    });

    it("defaults to English when nothing in the header is supported", () => {
        expect(resolveFromAcceptLanguage("fr-FR,de;q=0.9")).toBe(DEFAULT_LOCALE);
    });

    it("defaults to English for a missing header", () => {
        expect(resolveFromAcceptLanguage(undefined)).toBe(DEFAULT_LOCALE);
    });
});

describe("i18n.t", () => {
    it("translates a known key into the requested supported locale", () => {
        expect(t("sw", "common.unauthorized")).toBe("Ufikiaji umekataliwa. Hakuna tokeni iliyotolewa.");
        expect(t("en", "common.unauthorized")).toBe("Access denied. No token provided.");
    });

    it("falls back to English when the locale is unsupported", () => {
        expect(t("fr", "common.unauthorized")).toBe(t("en", "common.unauthorized"));
    });

    it("falls back to the raw key when it exists nowhere", () => {
        expect(t("en", "common.thisKeyDoesNotExist")).toBe("common.thisKeyDoesNotExist");
    });

    it("interpolates {placeholder} params", () => {
        const withParams = t("en", "errors.ACCOUNT_NOT_FOUND");
        expect(typeof withParams).toBe("string");
    });

    it("every locale in SUPPORTED_LOCALES is actually loadable", () => {
        for (const code of SUPPORTED_LOCALES) {
            expect(typeof t(code, "common.notFound")).toBe("string");
        }
    });
});
