const crypto = require("crypto");

// selcom.provider.js reads its config from env vars at module-load time,
// so set them before requiring it.
process.env.MOBILE_MONEY_API_BASE_URL = process.env.MOBILE_MONEY_API_BASE_URL || "https://apigwtest.selcommobile.com";
process.env.MOBILE_MONEY_API_KEY = process.env.MOBILE_MONEY_API_KEY || "test-selcom-key";
process.env.MOBILE_MONEY_API_SECRET = process.env.MOBILE_MONEY_API_SECRET || "test-selcom-api-secret";
process.env.MOBILE_MONEY_VENDOR_ID = process.env.MOBILE_MONEY_VENDOR_ID || "TESTVENDOR";

const selcomProvider = require("../../../src/modules/payment/providers/selcom.provider");

describe("selcom.provider signing (developers.selcommobile.com Authentication spec)", () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ resultcode: "000", reference: "SEL-REF-1" })
        });
        global.fetch = fetchMock;
    });

    afterEach(() => {
        delete global.fetch;
    });

    it("signs with timestamp FIRST in the digest string, not appended last", async () => {
        await selcomProvider.initiate("255655128812", 5000, { reference: "ORDER-1" });

        // create-order-minimal, then wallet-payment (USSD push)
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/checkout\/create-order-minimal$/);
        expect(fetchMock.mock.calls[1][0]).toMatch(/\/v1\/checkout\/wallet-payment$/);
        const [, requestInit] = fetchMock.mock.calls[0];
        const sentBody = JSON.parse(requestInit.body);
        const ts = requestInit.headers.Timestamp;
        const signedFieldsOrder = requestInit.headers["Signed-Fields"].split(",");

        const expectedDigestString = [`timestamp=${ts}`]
            .concat(signedFieldsOrder.map((key) => `${key}=${sentBody[key]}`))
            .join("&");
        const expectedDigest = crypto
            .createHmac("sha256", process.env.MOBILE_MONEY_API_SECRET)
            .update(expectedDigestString)
            .digest("base64");

        expect(requestInit.headers.Digest).toBe(expectedDigest);

        // Guard against silently reverting to "field=value...&timestamp=X"
        // (the original bug): a digest computed with timestamp LAST must
        // NOT match what the provider actually sent.
        const wrongOrderDigestString = signedFieldsOrder
            .map((key) => `${key}=${sentBody[key]}`)
            .concat(`timestamp=${ts}`)
            .join("&");
        const wrongOrderDigest = crypto
            .createHmac("sha256", process.env.MOBILE_MONEY_API_SECRET)
            .update(wrongOrderDigestString)
            .digest("base64");

        expect(requestInit.headers.Digest).not.toBe(wrongOrderDigest);
    });

    it("sends an ISO 8601 timestamp with a timezone offset, per the Authentication section's worked example", async () => {
        await selcomProvider.initiate("255655128812", 5000, { reference: "ORDER-2" });

        const [, requestInit] = fetchMock.mock.calls[0];
        // e.g. 2026-08-02T14:05:09+03:00 - developers.selcommobile.com's
        // own example is 2019-02-26T09:30:46+03:00.
        expect(requestInit.headers.Timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
        );
    });

    it("sends the Selcom-documented headers (Authorization, Digest-Method, Signed-Fields)", async () => {
        await selcomProvider.initiate("255655128812", 5000, { reference: "ORDER-3" });

        const [, requestInit] = fetchMock.mock.calls[0];
        expect(requestInit.headers.Authorization).toBe(`SELCOM ${Buffer.from(process.env.MOBILE_MONEY_API_KEY).toString("base64")}`);
        expect(requestInit.headers["Digest-Method"]).toBe("HS256");
        expect(requestInit.headers["Signed-Fields"]).toEqual(expect.any(String));
    });

    it("reports failure without throwing when Selcom returns a non-2xx response", async () => {
        fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

        const result = await selcomProvider.initiate("255655128812", 5000, { reference: "ORDER-4" });

        expect(result).toEqual({ success: false, transactionReference: null });
    });
});

describe("selcom.provider card checkout + status", () => {
    afterEach(() => {
        delete global.fetch;
    });

    it("creates a hosted card order and decodes the base64 payment page URL", async () => {
        const pageUrl = "https://checkout.selcom.example/pay/abc";
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                resultcode: "000",
                reference: "SEL-1",
                data: [{ payment_gateway_url: Buffer.from(pageUrl).toString("base64") }]
            })
        });

        const session = await selcomProvider.createCheckoutSession({
            amountTzs: 15000,
            reference: "ORDER-9-AAAAAAAAAAAA",
            description: "NEXORA order #9",
            successUrl: "https://nexora.example/orders/9?payment=success",
            cancelUrl: "https://nexora.example/orders/9?payment=cancelled",
            buyer: { name: "Asha Juma", email: "asha@example.com", phone: "0712345678" }
        });

        expect(session).toEqual({ success: true, sessionId: "SEL-1", url: pageUrl });
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toMatch(/\/v1\/checkout\/create-order$/);
        const body = JSON.parse(init.body);
        expect(body.order_id).toBe("ORDER-9-AAAAAAAAAAAA");
        expect(body.buyer_phone).toBe("255712345678");
        expect(body["billing.firstname"]).toBe("Asha");
        expect(Buffer.from(body.redirect_url, "base64").toString()).toContain("payment=success");
    });

    it("throws when Selcom refuses the card order", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ resultcode: "999", message: "bad vendor" }) });
        await expect(selcomProvider.createCheckoutSession({ amountTzs: 1, reference: "R", successUrl: "https://a", cancelUrl: "https://a" }))
            .rejects.toThrow("bad vendor");
    });

    it("maps order-status payment_status to a state", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ resultcode: "000", data: [{ payment_status: "COMPLETED", amount: "15000", reference: "R1" }] })
        });
        expect(await selcomProvider.checkStatus("ORDER-9-AAAAAAAAAAAA")).toMatchObject({ state: "success", amount: 15000 });
        const [url, init] = global.fetch.mock.calls[0];
        expect(init.method).toBe("GET");
        expect(url).toContain("order_id=ORDER-9-AAAAAAAAAAAA");
    });
});

describe("selcom.provider.isConfigured", () => {
    it("is true when all four Selcom env vars are set (as configured by test env setup above)", () => {
        expect(selcomProvider.isConfigured()).toBe(true);
    });
});
