const paymentReference = require("../../../src/modules/payment/paymentReference");

describe("paymentReference", () => {
    it("builds a unique opaque reference per attempt", () => {
        const a = paymentReference.build("order", 42);
        const b = paymentReference.build("order", 42);

        expect(a).toMatch(/^ORDER-42-[0-9A-F]{12}$/);
        expect(a).not.toBe(b);
    });

    it.each([["booking", "BOOKING"], ["subscription", "SUB"], ["topup", "TOPUP"]])("%s references use the %s prefix", (kind, prefix) => {
        expect(paymentReference.build(kind, 7)).toMatch(new RegExp(`^${prefix}-7-[0-9A-F]{12}$`));
    });

    it("rejects an unknown kind", () => {
        expect(() => paymentReference.build("nope", 1)).toThrow();
    });

    it("parses new-style references", () => {
        expect(paymentReference.parse("ORDER-42-0A1B2C3D4E5F")).toMatchObject({ kind: "order", id: 42, suffix: "0A1B2C3D4E5F", legacy: false });
    });

    it("still parses the old in-flight ORDER-<id> style (legacy)", () => {
        expect(paymentReference.parse("ORDER-42")).toMatchObject({ kind: "order", id: 42, suffix: null, legacy: true });
        expect(paymentReference.parse("SUB-3")).toMatchObject({ kind: "subscription", id: 3, legacy: true });
        expect(paymentReference.parse("BOOKING-9")).toMatchObject({ kind: "booking", id: 9 });
        expect(paymentReference.parse("TOPUP-11")).toMatchObject({ kind: "topup", id: 11 });
    });

    it("rejects anything else, including the retired VERIFY- prefix", () => {
        for (const bad of ["VERIFY-8", "garbage", "", null, undefined, "ORDER-", "ORDER-4-ZZZ", "ORDER-4-0A1B2C3D4E5F-extra"]) {
            expect(paymentReference.parse(bad)).toBeNull();
        }
    });
});
