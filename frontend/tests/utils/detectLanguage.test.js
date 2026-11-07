import { describe, it, expect, vi, afterEach } from "vitest";

const loadReal = () => vi.importActual("../../src/utils/detectLanguage");

const setLanguages = (langs) => {
    Object.defineProperty(window.navigator, "languages", { value: langs, configurable: true });
    Object.defineProperty(window.navigator, "language", { value: langs[0], configurable: true });
};

const setTimeZone = (tz) => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ timeZone: tz });
};

describe("detectDefaultLanguage", () => {
    afterEach(() => vi.restoreAllMocks());

    it("returns sw for a Swahili browser", async () => {
        setLanguages(["sw-TZ", "en"]);
        setTimeZone("Europe/London");
        const { detectDefaultLanguage } = await loadReal();
        expect(detectDefaultLanguage()).toBe("sw");
    });

    it("returns sw for an English browser on a Tanzanian time zone", async () => {
        setLanguages(["en-US"]);
        setTimeZone("Africa/Dar_es_Salaam");
        const { detectDefaultLanguage } = await loadReal();
        expect(detectDefaultLanguage()).toBe("sw");
    });

    it("returns en otherwise", async () => {
        setLanguages(["en-GB"]);
        setTimeZone("Europe/London");
        const { detectDefaultLanguage } = await loadReal();
        expect(detectDefaultLanguage()).toBe("en");
    });
});
