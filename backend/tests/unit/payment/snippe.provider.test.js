const crypto = require("crypto");

const snippeProvider = require("../../../src/modules/payment/providers/snippe.provider");

const sign = (body) => crypto
    .createHmac("sha256", process.env.SNIPPE_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

describe("snippe.provider.constructWebhookEvent", () => {
    const rawBody = Buffer.from(JSON.stringify({ type: "checkout.session.completed", data: { reference: "ORDER-1" } }));

    it("parses and returns the event when the signature is valid", () => {
        const event = snippeProvider.constructWebhookEvent(rawBody, sign(rawBody));
        expect(event.type).toBe("checkout.session.completed");
        expect(event.data.reference).toBe("ORDER-1");
    });

    it("throws when the signature header is missing", () => {
        expect(() => snippeProvider.constructWebhookEvent(rawBody, undefined)).toThrow("Missing Snippe webhook signature");
    });

    it("throws when the signature doesn't match the body", () => {
        expect(() => snippeProvider.constructWebhookEvent(rawBody, "0".repeat(64))).toThrow("Invalid Snippe webhook signature");
    });

    it("throws when the body was tampered with after signing", () => {
        const signature = sign(rawBody);
        const tamperedBody = Buffer.from(JSON.stringify({ type: "checkout.session.completed", data: { reference: "ORDER-999" } }));

        expect(() => snippeProvider.constructWebhookEvent(tamperedBody, signature)).toThrow("Invalid Snippe webhook signature");
    });

    it("throws when SNIPPE_WEBHOOK_SECRET isn't configured", () => {
        const original = process.env.SNIPPE_WEBHOOK_SECRET;
        delete process.env.SNIPPE_WEBHOOK_SECRET;

        expect(() => snippeProvider.constructWebhookEvent(rawBody, "anything")).toThrow(
            "SNIPPE_WEBHOOK_SECRET is not set"
        );

        process.env.SNIPPE_WEBHOOK_SECRET = original;
    });
});

describe("snippe.provider.isConfigured", () => {
    it("is true when SNIPPE_SECRET_KEY is set (as configured by test env setup)", () => {
        expect(snippeProvider.isConfigured()).toBe(true);
    });

    it("is false when SNIPPE_SECRET_KEY is unset", () => {
        const original = process.env.SNIPPE_SECRET_KEY;
        delete process.env.SNIPPE_SECRET_KEY;

        expect(snippeProvider.isConfigured()).toBe(false);

        process.env.SNIPPE_SECRET_KEY = original;
    });
});
