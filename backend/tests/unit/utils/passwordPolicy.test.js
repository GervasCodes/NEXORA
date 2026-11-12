const { checkPassword, passwordRule, MAX_BYTES } = require("../../../src/utils/passwordPolicy");

describe("passwordPolicy.checkPassword", () => {
    it.each(["Tz!kj83nD2", "correct horse battery staple", "mnbvcxz-9081", "Karibu_Nexora#41"])("accepts %p", (pw) => {
        expect(checkPassword(pw)).toBeNull();
    });

    it.each([undefined, null, 12345678, "", "short", "1234567"])("rejects %p as too short or not a string", (pw) => {
        expect(checkPassword(pw).code).toBe("too_short");
    });

    it("accepts exactly 72 bytes and rejects 73", () => {
        expect(checkPassword("aB3$".repeat(18))).toBeNull();            // 72 bytes
        expect(checkPassword("aB3$".repeat(18) + "x").code).toBe("too_long");
    });

    it("counts bytes, not characters (multi-byte letters)", () => {
        expect(checkPassword("é".repeat(35) + "zQ")).toBeNull();        // 35*2 + 2 = 72 bytes
        expect(checkPassword("é".repeat(36) + "zQ").code).toBe("too_long"); // 74 bytes
    });

    it.each(["password", "PASSWORD123", "12345678", "qwertyuiop", "iloveyou", "Nexora123", "00000000"])("rejects the common password %p", (pw) => {
        expect(checkPassword(pw).code).toBe("too_common");
    });

    it.each(["aaaaaaaa", "zzzzzzzzzz", "abcdefgh", "87654321", "23456789", "hgfedcba"])("rejects the trivial pattern %p", (pw) => {
        expect(checkPassword(pw).code).toBe("too_common");
    });

    it.each(["987654321", "q1w2e3r4t5", "Liverpool", "SUMMER2026"])("rejects the common password %p (checked offline, case-insensitive)", (pw) => {
        expect(checkPassword(pw).code).toBe("too_common");
    });

    it("passwordRule throws the message for express-validator and returns true when fine", () => {
        expect(() => passwordRule("short")).toThrow("at least 8");
        expect(passwordRule("Tz!kj83nD2")).toBe(true);
    });

    it("exposes the limit", () => {
        expect(MAX_BYTES).toBe(72);
    });
});
