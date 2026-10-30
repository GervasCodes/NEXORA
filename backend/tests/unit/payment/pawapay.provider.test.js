const crypto = require("crypto");

process.env.PAWAPAY_API_TOKEN = "test-pawapay-token";
process.env.PAWAPAY_MODE = "sandbox";

const pawapay = require("../../../src/modules/payment/providers/pawapay.provider");
const { detectNetwork, toMsisdn } = require("../../../src/utils/tzMobileNetwork");

const jsonResponse = (data, ok = true) => ({ ok, json: async () => data });

afterEach(() => {
    delete global.fetch;
    pawapay._resetKeyCache();
});

describe("tzMobileNetwork", () => {
    it("normalises Tanzanian numbers to 255XXXXXXXXX", () => {
        expect(toMsisdn("0712 345 678")).toBe("255712345678");
        expect(toMsisdn("+255712345678")).toBe("255712345678");
        expect(toMsisdn("12345")).toBeNull();
    });

    it("detects the network from the prefix", () => {
        expect(detectNetwork("0755123456").pawapay).toBe("VODACOM_TZA");
        expect(detectNetwork("0655123456").azampay).toBe("Tigo");
        expect(detectNetwork("0785123456").pawapay).toBe("AIRTEL_TZA");
        expect(detectNetwork("0625123456").pawapay).toBe("HALOTEL_TZA");
        expect(detectNetwork("0995123456")).toBeNull();
    });
});

describe("pawapay.provider.depositIdFor", () => {
    it("is a stable UUID per reference", () => {
        const a = pawapay.depositIdFor("ORDER-1-AAAAAAAAAAAA");
        expect(pawapay.isDepositId(a)).toBe(true);
        expect(pawapay.depositIdFor("ORDER-1-AAAAAAAAAAAA")).toBe(a);
        expect(pawapay.depositIdFor("ORDER-2-AAAAAAAAAAAA")).not.toBe(a);
    });
});

describe("pawapay.provider.initiate", () => {
    it("posts a v2 deposit and returns the deposit id as transaction reference", async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse({ provider: "VODACOM_TZA" })) // predict-provider
            .mockResolvedValueOnce(jsonResponse({ status: "ACCEPTED" }));

        const result = await pawapay.initiate("0755123456", 15000, { reference: "ORDER-1-AAAAAAAAAAAA", description: "NEXORA order #1" });

        expect(result).toEqual({ success: true, transactionReference: pawapay.depositIdFor("ORDER-1-AAAAAAAAAAAA") });
        const [url, init] = global.fetch.mock.calls[1];
        expect(url).toBe("https://api.sandbox.pawapay.io/v2/deposits");
        expect(init.headers.Authorization).toBe("Bearer test-pawapay-token");
        expect(JSON.parse(init.body)).toMatchObject({
            payer: { type: "MMO", accountDetails: { phoneNumber: "255755123456", provider: "VODACOM_TZA" } },
            amount: "15000",
            currency: "TZS"
        });
    });

    it("falls back to the number prefix when predict-provider fails", async () => {
        global.fetch = jest.fn()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce(jsonResponse({ status: "ACCEPTED" }));

        await pawapay.initiate("0785123456", 1000, { reference: "ORDER-2-AAAAAAAAAAAA" });
        expect(JSON.parse(global.fetch.mock.calls[1][1].body).payer.accountDetails.provider).toBe("AIRTEL_TZA");
    });

    it("reports REJECTED as a failure", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: "REJECTED", failureReason: { failureCode: "X" } }));
        const result = await pawapay.initiate("0755123456", 1000, { reference: "ORDER-3-AAAAAAAAAAAA", mno: "VODACOM_TZA" });
        expect(result).toEqual({ success: false, transactionReference: null });
    });

    it("rejects a non-Tanzanian number up front", async () => {
        await expect(pawapay.initiate("123", 1000, {})).rejects.toThrow("valid Tanzanian");
    });
});

describe("pawapay.provider.checkStatus", () => {
    it("maps COMPLETED / FAILED and treats NOT_FOUND as unknown", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: "FOUND", data: { status: "COMPLETED", amount: "15000.00", currency: "TZS" } }));
        expect(await pawapay.checkStatus("ORDER-1-AAAAAAAAAAAA")).toMatchObject({ state: "success", amount: 15000, currency: "TZS" });

        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: "FOUND", data: { status: "FAILED" } }));
        expect((await pawapay.checkStatus("ORDER-1-AAAAAAAAAAAA")).state).toBe("failed");

        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: "NOT_FOUND" }));
        expect((await pawapay.checkStatus("ORDER-1-AAAAAAAAAAAA")).state).toBe("unknown");
    });
});

describe("pawapay.provider refunds and payouts", () => {
    it("refunds against the original deposit when its id is known", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: "ACCEPTED" }));
        const depositId = pawapay.depositIdFor("ORDER-1-AAAAAAAAAAAA");
        const result = await pawapay.refund("0755123456", 5000, { reference: "R-1", depositId });

        expect(result.success).toBe(true);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toMatch(/\/v2\/refunds$/);
        expect(JSON.parse(init.body)).toMatchObject({ depositId, amount: "5000", currency: "TZS" });
    });

    it("falls back to a payout when there is no deposit id", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ status: "ACCEPTED" }));
        const result = await pawapay.refund("0755123456", 5000, { reference: "R-2", mno: "VODACOM_TZA" });
        expect(result.success).toBe(true);
        expect(global.fetch.mock.calls[0][0]).toMatch(/\/v2\/payouts$/);
    });
});

// RFC 9421 verification, exercised with a locally generated P-256 key that
// signs exactly the way PawaPay's documentation describes.
describe("pawapay.provider.verifyCallbackSignature", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const publicPem = publicKey.export({ type: "spki", format: "pem" });

    const build = ({ body, created, expires, tamper } = {}) => {
        const rawBody = Buffer.from(body || JSON.stringify({ depositId: "d", status: "COMPLETED" }));
        const now = Math.floor(Date.now() / 1000);
        const contentDigest = `sha-256=:${crypto.createHash("sha256").update(rawBody).digest("base64")}:`;
        const headers = {
            "content-type": "application/json",
            "content-digest": contentDigest,
            "signature-date": new Date().toUTCString()
        };
        const components = ["@method", "@authority", "@path", "signature-date", "content-digest", "content-type"];
        const params = `(${components.map((c) => `"${c}"`).join(" ")});alg="ecdsa-p256-sha256";keyid="HTTP_EC_P256_KEY:1";created=${created ?? now};expires=${expires ?? now + 300}`;
        const base = [
            `"@method": POST`,
            `"@authority": api.nexora.example`,
            `"@path": /api/v1/payments/webhooks/pawapay`,
            `"signature-date": ${headers["signature-date"]}`,
            `"content-digest": ${headers["content-digest"]}`,
            `"content-type": ${headers["content-type"]}`,
            `"@signature-params": ${params}`
        ].join("\n");
        const sig = crypto.sign("sha256", Buffer.from(base), { key: privateKey, dsaEncoding: "ieee-p1363" });
        headers["signature-input"] = `sig-pp=${params}`;
        headers.signature = `sig-pp=:${sig.toString("base64")}:`;
        return { rawBody: tamper ? Buffer.from("{\"depositId\":\"evil\"}") : rawBody, headers };
    };

    const verify = (input) => pawapay.verifyCallbackSignature({
        ...input,
        method: "POST",
        authority: "api.nexora.example",
        path: "/api/v1/payments/webhooks/pawapay"
    });

    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse([{ id: "HTTP_EC_P256_KEY:1", key: publicPem }]));
    });

    it("accepts a correctly signed callback", async () => {
        expect(await verify(build())).toBe(true);
    });

    it("rejects a body that does not match its Content-Digest", async () => {
        expect(await verify(build({ tamper: true }))).toBe(false);
    });

    it("rejects an expired signature", async () => {
        const past = Math.floor(Date.now() / 1000) - 1000;
        expect(await verify(build({ created: past - 300, expires: past }))).toBe(false);
    });

    it("rejects a signature made by another key", async () => {
        const other = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse([{ id: "HTTP_EC_P256_KEY:1", key: other.publicKey.export({ type: "spki", format: "pem" }) }]));
        expect(await verify(build())).toBe(false);
    });

    it("rejects a request for a different path/authority", async () => {
        const input = build();
        expect(await pawapay.verifyCallbackSignature({ ...input, method: "POST", authority: "evil.example", path: "/api/v1/payments/webhooks/pawapay" })).toBe(false);
    });

    it("rejects missing signature headers", async () => {
        expect(await verify({ rawBody: Buffer.from("{}"), headers: {} })).toBe(false);
    });
});
