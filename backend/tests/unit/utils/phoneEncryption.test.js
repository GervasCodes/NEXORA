const crypto = require("crypto");

const load = () => {
    jest.resetModules();
    return require("../../../src/utils/phoneEncryption");
};

describe("phoneEncryption", () => {
    let originalEnv;
    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.JWT_SECRET = "a".repeat(40);
        delete process.env.PHONE_ENCRYPTION_KEY;
        delete process.env.PHONE_ENCRYPTION_KEY_ID;
        delete process.env.PHONE_ENCRYPTION_KEY_PREVIOUS;
    });
    afterEach(() => { process.env = originalEnv; });

    it("round-trips in the legacy format when no dedicated key is configured (behaviour unchanged)", () => {
        const pe = load();
        const payload = pe.encryptPhone("255712345678");
        expect(payload.startsWith("v2:")).toBe(false);
        expect(payload.split(".")).toHaveLength(3);
        expect(pe.decryptPhone(payload)).toBe("255712345678");
    });

    it("returns null for empty input and for garbage", () => {
        const pe = load();
        expect(pe.encryptPhone("")).toBeNull();
        expect(pe.decryptPhone(null)).toBeNull();
        expect(pe.decryptPhone("not-a-payload")).toBeNull();
        expect(pe.decryptPhone("v2:k1:a.b.c")).toBeNull();
    });

    it("writes v2 with a key id once PHONE_ENCRYPTION_KEY is set", () => {
        process.env.PHONE_ENCRYPTION_KEY = "dedicated-key-1";
        process.env.PHONE_ENCRYPTION_KEY_ID = "k7";
        const pe = load();
        const payload = pe.encryptPhone("255700000001");
        expect(payload.startsWith("v2:k7:")).toBe(true);
        expect(pe.decryptPhone(payload)).toBe("255700000001");
    });

    it("v2 values do not depend on JWT_SECRET", () => {
        process.env.PHONE_ENCRYPTION_KEY = "dedicated-key-1";
        const pe = load();
        const payload = pe.encryptPhone("255700000002");
        process.env.JWT_SECRET = "b".repeat(40); // session secret rotated
        const pe2 = load();
        expect(pe2.decryptPhone(payload)).toBe("255700000002");
    });

    it("still decrypts values written in the legacy format after the dedicated key is introduced", () => {
        const legacy = load().encryptPhone("255700000003");
        process.env.PHONE_ENCRYPTION_KEY = "dedicated-key-1";
        const pe = load();
        expect(pe.decryptPhone(legacy)).toBe("255700000003");
    });

    it("cannot decrypt v2 with the wrong key, and tampering is detected", () => {
        process.env.PHONE_ENCRYPTION_KEY = "dedicated-key-1";
        const payload = load().encryptPhone("255700000004");
        process.env.PHONE_ENCRYPTION_KEY = "some-other-key";
        expect(load().decryptPhone(payload)).toBeNull();
        process.env.PHONE_ENCRYPTION_KEY = "dedicated-key-1";
        const parts = payload.split(".");
        parts[2] = Buffer.from(crypto.randomBytes(12)).toString("base64");
        expect(load().decryptPhone(parts.join("."))).toBeNull();
    });

    it("supports rotation through PHONE_ENCRYPTION_KEY_PREVIOUS", () => {
        process.env.PHONE_ENCRYPTION_KEY = "old-key";
        const oldPayload = load().encryptPhone("255700000005");
        process.env.PHONE_ENCRYPTION_KEY = "new-key";
        process.env.PHONE_ENCRYPTION_KEY_PREVIOUS = "old-key";
        process.env.PHONE_ENCRYPTION_KEY_ID = "k2";
        const pe = load();
        expect(pe.decryptPhone(oldPayload)).toBe("255700000005");
        const rotated = pe.reencryptPhone(oldPayload);
        expect(rotated.startsWith("v2:k2:")).toBe(true);
        delete process.env.PHONE_ENCRYPTION_KEY_PREVIOUS;
        expect(load().decryptPhone(rotated)).toBe("255700000005");
    });

    it("reencryptPhone converts a legacy value and returns null for undecryptable input", () => {
        const legacy = load().encryptPhone("255700000006");
        process.env.PHONE_ENCRYPTION_KEY = "dedicated-key-1";
        const pe = load();
        const converted = pe.reencryptPhone(legacy);
        expect(pe.isV2(converted)).toBe(true);
        expect(pe.decryptPhone(converted)).toBe("255700000006");
        expect(pe.reencryptPhone("garbage")).toBeNull();
    });
});
