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

        expect(fetchMock).toHaveBeenCalledTimes(1);
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
        expect(requestInit.headers.Authorization).toBe(`SELCOM ${process.env.MOBILE_MONEY_API_KEY}`);
        expect(requestInit.headers["Digest-Method"]).toBe("HS256");
        expect(requestInit.headers["Signed-Fields"]).toEqual(expect.any(String));
    });

    it("reports failure without throwing when Selcom returns a non-2xx response", async () => {
        fetchMock.mockResolvedValue({ ok: false });

        const result = await selcomProvider.initiate("255655128812", 5000, { reference: "ORDER-4" });

        expect(result).toEqual({ success: false, transactionReference: null });
    });
});

describe("selcom.provider.isConfigured", () => {
    it("is true when all four Selcom env vars are set (as configured by test env setup above)", () => {
        expect(selcomProvider.isConfigured()).toBe(true);
    });
});
