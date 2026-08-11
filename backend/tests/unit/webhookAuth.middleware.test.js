const { verifySharedSecretHeader } = require("../../src/middleware/webhookAuth.middleware");

// verifySharedSecretHeader isn't currently wired to any route (see the
// module's own header comment) - it's a documented fallback for if a
// provider's real webhook auth turns out to differ from their public
// docs. Not being live doesn't make an unsafe comparison in it harmless
// forever: it's one route-wiring change away from handling real
// traffic, so it's held to the same timing-safe-comparison standard as
// verifyMalipopayWebhook/verifySelcomWebhook above it in the same file.
describe("webhookAuth.middleware - verifySharedSecretHeader", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV, TEST_WEBHOOK_SECRET: "correct-secret-value" };
    });

    afterEach(() => {
        process.env = OLD_ENV;
    });

    const run = (headerValue) => {
        const req = { headers: headerValue !== undefined ? { "x-webhook-secret": headerValue } : {}, id: "req-1", ip: "127.0.0.1" };
        const json = jest.fn();
        const res = { status: jest.fn(() => ({ json })) };
        const next = jest.fn();
        verifySharedSecretHeader("TEST_WEBHOOK_SECRET", "testprovider")(req, res, next);
        return { res, json, next };
    };

    it("calls next() for the correct secret", () => {
        const { next, res } = run("correct-secret-value");
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects (200, success:false) for a wrong secret of the same length", () => {
        // Same length as the real secret - only a timing-safe comparison
        // guarantees this doesn't leak anything via response timing.
        const { next, res, json } = run("wrong-secret-values".slice(0, "correct-secret-value".length));
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({ success: false });
    });

    it("rejects a shorter secret without throwing (crypto.timingSafeEqual would throw on a raw length mismatch)", () => {
        const { next, res } = run("short");
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("rejects a missing header without throwing", () => {
        const { next, res } = run(undefined);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
