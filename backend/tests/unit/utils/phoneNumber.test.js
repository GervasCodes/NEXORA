const { normalizePhone, isValidPhone, splitPhone, findCountry, SUPPORTED_COUNTRIES } = require("../../../src/utils/phoneNumber");

describe("utils/phoneNumber", () => {
    describe("normalizePhone", () => {
        it("normalizes a locally-dialled Tanzanian number (leading trunk 0)", () => {
            expect(normalizePhone("0712345678", "TZ")).toBe("+255712345678");
        });

        it("normalizes a bare national number with no trunk 0", () => {
            expect(normalizePhone("712345678", "TZ")).toBe("+255712345678");
        });

        it("normalizes a number already typed with a + and dial code", () => {
            expect(normalizePhone("+255712345678", "TZ")).toBe("+255712345678");
        });

        it("normalizes a number typed with the dial code but no +", () => {
            expect(normalizePhone("255712345678", "TZ")).toBe("+255712345678");
        });

        it("strips spaces/dashes/parens formatting", () => {
            expect(normalizePhone("0712 345-678", "TZ")).toBe("+255712345678");
        });

        it("returns null for a too-short number", () => {
            expect(normalizePhone("07123", "TZ")).toBeNull();
        });

        it("returns null for a too-long number", () => {
            expect(normalizePhone("07123456789999", "TZ")).toBeNull();
        });

        it("returns null for an empty/missing value", () => {
            expect(normalizePhone("", "TZ")).toBeNull();
            expect(normalizePhone(undefined, "TZ")).toBeNull();
        });

        it("returns null for an unknown country code", () => {
            expect(normalizePhone("0712345678", "ZZ")).toBeNull();
        });

        it("defaults to Tanzania when no country code is given", () => {
            expect(normalizePhone("0712345678")).toBe("+255712345678");
        });

        it("supports every configured East African country's own dial code", () => {
            expect(normalizePhone("0712345678", "KE")).toBe("+254712345678");
            expect(normalizePhone("0712345678", "UG")).toBe("+256712345678");
            expect(normalizePhone("0712345678", "RW")).toBe("+250712345678");
            expect(normalizePhone("071234567", "BI")).toBe("+25771234567"); // BI has an 8-digit NSN
        });

        it("is case-insensitive on the country code", () => {
            expect(normalizePhone("0712345678", "tz")).toBe("+255712345678");
        });

        // frontend/src/data/countryCodes.js has ~50 countries in its
        // registration country picker, not just the 5 this module has
        // exact numbering-plan data for - Register.jsx already glues
        // the dial code onto the number client-side before submitting,
        // so a non-East-African number must be accepted and stored
        // as-is rather than rejected for not matching the default (TZ)
        // country's national number length.
        it("passes through an already-international number for a country outside SUPPORTED_COUNTRIES", () => {
            expect(normalizePhone("+15551234567", "TZ")).toBe("+15551234567");
            expect(normalizePhone("15551234567", "TZ")).toBe("+15551234567"); // no leading +, still recognized as international
        });
    });

    describe("isValidPhone", () => {
        it("mirrors normalizePhone's success/failure", () => {
            expect(isValidPhone("0712345678", "TZ")).toBe(true);
            expect(isValidPhone("123", "TZ")).toBe(false);
        });
    });

    describe("splitPhone", () => {
        it("splits a stored E.164 number back into country + national number", () => {
            expect(splitPhone("+255712345678")).toEqual({ countryCode: "TZ", nationalNumber: "712345678" });
        });

        it("falls back to the default country for an unrecognized dial code", () => {
            expect(splitPhone("+19995551234")).toEqual({ countryCode: "TZ", nationalNumber: "19995551234" });
        });
    });

    describe("findCountry / SUPPORTED_COUNTRIES", () => {
        it("exposes every supported country with a dial code and expected number length", () => {
            expect(SUPPORTED_COUNTRIES.length).toBeGreaterThanOrEqual(5);
            SUPPORTED_COUNTRIES.forEach((c) => {
                expect(c.code).toBeTruthy();
                expect(c.dialCode).toBeTruthy();
                expect(c.nsnLength).toBeGreaterThan(0);
            });
        });

        it("finds a country case-insensitively", () => {
            expect(findCountry("tz").dialCode).toBe("255");
        });
    });
});
