const { PDF_ONLY_FIELDS, isPdfOnlyField, hasImageExtension } = require("../../../src/utils/kycDocumentRules");

describe("utils/kycDocumentRules", () => {
    describe("isPdfOnlyField", () => {
        it.each([
            "national_id",
            "voter_id",
            "brela_certificate",
            "tin_certificate",
            "business_license",
            "drivers_license"
        ])("treats %s as PDF-only", (field) => {
            expect(isPdfOnlyField(field)).toBe(true);
        });

        it("includes drivers_license in PDF_ONLY_FIELDS (regression guard: it used to be excluded)", () => {
            expect(PDF_ONLY_FIELDS).toContain("drivers_license");
        });

        it("covers exactly the six KYC document fields", () => {
            expect([...PDF_ONLY_FIELDS].sort()).toEqual([
                "brela_certificate",
                "business_license",
                "drivers_license",
                "national_id",
                "tin_certificate",
                "voter_id"
            ]);
        });

        it("does not treat owner_photo as PDF-only (a selfie is a photo by nature)", () => {
            expect(isPdfOnlyField("owner_photo")).toBe(false);
        });

        it("does not treat unrelated fields as PDF-only", () => {
            expect(isPdfOnlyField("file")).toBe(false);
            expect(isPdfOnlyField(undefined)).toBe(false);
        });

        it("keeps the list frozen", () => {
            expect(Object.isFrozen(PDF_ONLY_FIELDS)).toBe(true);
        });
    });

    describe("hasImageExtension", () => {
        it.each(["a.jpg", "a.JPEG", "a.png", "a.gif", "a.bmp", "a.webp", "a.heic", "a.heif", "a.tif", "a.tiff"])(
            "flags %s as an image",
            (name) => {
                expect(hasImageExtension(name)).toBe(true);
            }
        );

        it("does not flag a PDF filename", () => {
            expect(hasImageExtension("license.pdf")).toBe(false);
        });

        it("only looks at the final extension", () => {
            expect(hasImageExtension("scan.png.pdf")).toBe(false);
            expect(hasImageExtension("scan.pdf.png")).toBe(true);
        });

        it("returns false for empty/missing filenames", () => {
            expect(hasImageExtension("")).toBe(false);
            expect(hasImageExtension(undefined)).toBe(false);
            expect(hasImageExtension(null)).toBe(false);
        });
    });
});
