const webhookAuth = require("../../src/middleware/webhookAuth.middleware");

// Every webhook verifier must refuse to run unauthenticated when its secret
// is missing - in production the ALLOW_UNSIGNED_WEBHOOKS escape hatch is
// ignored entirely.
describe("webhook verifiers fail closed when their secret is not configured", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV, NODE_ENV: "production", ALLOW_UNSIGNED_WEBHOOKS: "true" };
        [
            "MOBILE_MONEY_API_KEY", "SELCOM_WEBHOOK_SECRET", "SMS_GATEWAY_WEBHOOK_SECRET",
            "WHATSAPP_APP_SECRET", "TEST_WEBHOOK_SECRET"
        ].forEach((name) => delete process.env[name]);
    });

    afterEach(() => {
        process.env = OLD_ENV;
    });

    const run = async (verifier) => {
        const req = { headers: {}, body: {}, id: "req-1", ip: "127.0.0.1" };
        const json = jest.fn();
        const send = jest.fn();
        const res = { status: jest.fn(() => ({ json, send })) };
        const next = jest.fn();
        await verifier(req, res, next);
        return next;
    };

    it.each([
        ["malipopay", () => webhookAuth.verifyMalipopayWebhook],
        ["selcom", () => webhookAuth.verifySelcomWebhook],
        ["sms", () => webhookAuth.verifySmsWebhook],
        ["whatsapp", () => webhookAuth.verifyWhatsAppWebhook],
        ["shared secret", () => webhookAuth.verifySharedSecretHeader("TEST_WEBHOOK_SECRET", "test")]
    ])("%s does not call next()", async (_name, getVerifier) => {
        const next = await run(getVerifier());
        expect(next).not.toHaveBeenCalled();
    });

    it("the local-development escape hatch only works outside production", async () => {
        process.env.NODE_ENV = "development";
        const next = await run(webhookAuth.verifySmsWebhook);
        expect(next).toHaveBeenCalled();
    });
});
