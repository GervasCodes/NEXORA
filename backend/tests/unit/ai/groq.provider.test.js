const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
    jest.resetModules();
});

describe("ai/providers/groq.provider", () => {
    it("isConfigured is false without GROQ_API_KEY, true with it", () => {
        delete process.env.GROQ_API_KEY;
        let provider = require("../../../src/modules/ai/providers/groq.provider");
        expect(provider.isConfigured()).toBe(false);

        jest.resetModules();
        process.env.GROQ_API_KEY = "gsk-test";
        provider = require("../../../src/modules/ai/providers/groq.provider");
        expect(provider.isConfigured()).toBe(true);
    });

    it("sends an OpenAI-compatible chat/completions request and normalizes the response", async () => {
        process.env.GROQ_API_KEY = "gsk-test";
        const provider = require("../../../src/modules/ai/providers/groq.provider");

        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: "hello from groq" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5 }
            })
        });
        global.fetch = fetchMock;

        const result = await provider.complete({
            system: "sys",
            messages: [{ role: "user", content: "hi" }],
            maxTokens: 200
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, requestInit] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
        expect(requestInit.headers.Authorization).toBe("Bearer gsk-test");

        const body = JSON.parse(requestInit.body);
        expect(body.max_tokens).toBe(200);
        expect(body.messages).toEqual([
            { role: "system", content: "sys" },
            { role: "user", content: "hi" }
        ]);

        expect(result).toEqual({ text: "hello from groq", inputTokens: 10, outputTokens: 5 });
    });

    it("throws on a non-ok response so ai.service.js's callProvider falls back", async () => {
        process.env.GROQ_API_KEY = "gsk-test";
        const provider = require("../../../src/modules/ai/providers/groq.provider");

        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => "invalid api key"
        });

        await expect(
            provider.complete({ system: "sys", messages: [{ role: "user", content: "hi" }] })
        ).rejects.toThrow(/Groq API error 401/);
    });
});
