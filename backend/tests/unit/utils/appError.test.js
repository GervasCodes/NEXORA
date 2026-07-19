const appError = require("../../../src/utils/appError");

describe("appError", () => {
    it("creates a real Error instance carrying code and status", () => {
        const err = appError("INVALID_CREDENTIALS", 401);

        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe("INVALID_CREDENTIALS");
        expect(err.status).toBe(401);
        expect(err.message).toBe("INVALID_CREDENTIALS"); // Error's own message mirrors the code
    });

    it("defaults status to 400 when not provided", () => {
        const err = appError("SOME_CODE");
        expect(err.status).toBe(400);
    });

    it("is throwable/catchable like any Error", () => {
        expect(() => {
            throw appError("ACCOUNT_NOT_FOUND", 404);
        }).toThrow("ACCOUNT_NOT_FOUND");
    });
});
