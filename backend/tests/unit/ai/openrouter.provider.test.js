const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
    jest.resetModules();
});

describe("ai/providers/openrouter.provider", () => {
    it("isConfigured is false without OPENROUTER_API_KEY, true with it", () => {
        delete process.env.OPENROUTER_API_KEY;
        let provider = require("../../../src/modules/ai/providers/openrouter.provider");
        expect(provider.isConfigured()).toBe(false);

        jest.resetModules();
        process.env.OPENROUTER_API_KEY = "or-test";
        provider = require("../../../src/modules/ai/providers/openrouter.provider");
        expect(provider.isConfigured()).toBe(true);
    });

    it("sends an OpenAI-compatible chat/completions request without optional attribution headers by default", async () => {
        process.env.OPENROUTER_API_KEY = "or-test";
        delete process.env.AI_OPENROUTER_SITE_URL;
        delete process.env.AI_OPENROUTER_SITE_NAME;
        const provider = require("../../../src/modules/ai/providers/openrouter.provider");

        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: "hello from openrouter" } }],
                usage: { prompt_tokens: 8, completion_tokens: 4 }
            })
        });
        global.fetch = fetchMock;

        const result = await provider.complete({
            system: "sys",
            messages: [{ role: "user", content: "hi" }]
        });

        const [url, requestInit] = fetchMock.mock.calls[0];
        expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
        expect(requestInit.headers.Authorization).toBe("Bearer or-test");
        expect(requestInit.headers["HTTP-Referer"]).toBeUndefined();
        expect(requestInit.headers["X-Title"]).toBeUndefined();
        expect(result).toEqual({ text: "hello from openrouter", inputTokens: 8, outputTokens: 4 });
    });

    it("includes HTTP-Referer/X-Title when the optional site env vars are set", async () => {
        process.env.OPENROUTER_API_KEY = "or-test";
        process.env.AI_OPENROUTER_SITE_URL = "https://nexora.example";
        process.env.AI_OPENROUTER_SITE_NAME = "NEXORA";
        const provider = require("../../../src/modules/ai/providers/openrouter.provider");

        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} })
        });
        global.fetch = fetchMock;

        await provider.complete({ system: "sys", messages: [{ role: "user", content: "hi" }] });

        const [, requestInit] = fetchMock.mock.calls[0];
        expect(requestInit.headers["HTTP-Referer"]).toBe("https://nexora.example");
        expect(requestInit.headers["X-Title"]).toBe("NEXORA");
    });

    it("throws on a non-ok response so ai.service.js's callProvider falls back", async () => {
        process.env.OPENROUTER_API_KEY = "or-test";
        const provider = require("../../../src/modules/ai/providers/openrouter.provider");

        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => "rate limited"
        });

        await expect(
            provider.complete({ system: "sys", messages: [{ role: "user", content: "hi" }] })
        ).rejects.toThrow(/OpenRouter API error 429/);
    });
});
