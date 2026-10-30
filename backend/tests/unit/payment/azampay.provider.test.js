process.env.AZAMPAY_API_BASE_URL = "https://sandbox.azampay.example";
process.env.AZAMPAY_AUTH_BASE_URL = "https://auth-sandbox.azampay.example";
process.env.AZAMPAY_APP_NAME = "nexora";
process.env.AZAMPAY_CLIENT_ID = "cid";
process.env.AZAMPAY_CLIENT_SECRET = "secret";
process.env.AZAMPAY_VENDOR_ID = "vendor-1";

const azampay = require("../../../src/modules/payment/providers/azampay.provider");

const res = (data, ok = true) => ({ ok, json: async () => data });
const tokenResponse = () => res({ data: { accessToken: "tok", expire: new Date(Date.now() + 3600e3).toISOString() }, success: true });

beforeEach(() => azampay._resetTokenCache());
afterEach(() => delete global.fetch);

describe("azampay.provider", () => {
    it("gets a token from the authenticator host, then pushes to the detected network", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(res({ success: true, transactionId: "T1" }));

        const result = await azampay.initiate("0755123456", 15000, { reference: "ORDER-1-AAAAAAAAAAAA" });

        expect(result).toEqual({ success: true, transactionReference: "T1" });
        expect(global.fetch.mock.calls[0][0]).toBe("https://auth-sandbox.azampay.example/AppRegistration/GenerateToken");
        const [url, init] = global.fetch.mock.calls[1];
        expect(url).toBe("https://sandbox.azampay.example/azampay/mno/checkout");
        expect(init.headers.Authorization).toBe("Bearer tok");
        expect(JSON.parse(init.body)).toMatchObject({ accountNumber: "255755123456", provider: "Mpesa", currency: "TZS", externalId: "ORDER-1-AAAAAAAAAAAA" });
    });

    it("reuses the cached token", async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(tokenResponse())
            .mockResolvedValue(res({ success: true, transactionId: "T" }));
        await azampay.initiate("0755123456", 1000, { reference: "A" });
        await azampay.initiate("0755123456", 1000, { reference: "B" });
        expect(global.fetch.mock.calls.filter(([url]) => url.includes("GenerateToken"))).toHaveLength(1);
    });

    it("fails clearly when the network cannot be detected", async () => {
        global.fetch = jest.fn().mockResolvedValue(tokenResponse());
        await expect(azampay.initiate("0995123456", 1000, { reference: "A" })).rejects.toThrow("mobile money network");
    });

    it("creates a hosted checkout and returns the payment page URL", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(res({ data: "https://pay.azampay.example/abc", success: true }));

        const session = await azampay.createCheckoutSession({
            amountTzs: 20000,
            reference: "ORDER-5-AAAAAAAAAAAA",
            description: "NEXORA order #5",
            successUrl: "https://nexora.example/orders/5?payment=success",
            cancelUrl: "https://nexora.example/orders/5?payment=cancelled"
        });

        expect(session).toEqual({ success: true, sessionId: "ORDER-5-AAAAAAAAAAAA", url: "https://pay.azampay.example/abc" });
        const [url, init] = global.fetch.mock.calls[1];
        expect(url).toBe("https://sandbox.azampay.example/api/v1/Partner/PostCheckout");
        expect(JSON.parse(init.body)).toMatchObject({
            vendorId: "vendor-1",
            externalId: "ORDER-5-AAAAAAAAAAAA",
            amount: "20000",
            requestOrigin: "https://nexora.example",
            redirectSuccessURL: "https://nexora.example/orders/5?payment=success"
        });
    });

    it("throws when hosted checkout is refused", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(res({ success: false, message: "nope" }, false));
        await expect(azampay.createCheckoutSession({ amountTzs: 1, reference: "R", successUrl: "https://a.example/x", cancelUrl: "https://a.example/y" }))
            .rejects.toThrow("nope");
    });
});
