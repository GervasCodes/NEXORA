const { maskPayoutDetails } = require("../../../src/utils/maskPayout");

describe("maskPayoutDetails", () => {
    it("keeps only the last four letters/digits", () => {
        expect(maskPayoutDetails("0150123456789")).toBe("•••••••••6789");
    });

    it("keeps separators so the shape is readable", () => {
        expect(maskPayoutDetails("CRDB 0150-1234")).toBe("•••• ••••-1234");
    });

    it("masks everything but the last four of short values", () => {
        expect(maskPayoutDetails("12345")).toBe("•2345");
        expect(maskPayoutDetails("12")).toBe("12");
    });

    it("handles empty input", () => {
        expect(maskPayoutDetails(null)).toBe("");
        expect(maskPayoutDetails("")).toBe("");
    });
});
