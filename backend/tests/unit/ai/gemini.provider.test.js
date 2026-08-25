const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
    jest.resetModules();
});

describe("ai/providers/gemini.provider", () => {
    it("isConfigured is false without GEMINI_API_KEY, true with it", () => {
        delete process.env.GEMINI_API_KEY;
        let provider = require("../../../src/modules/ai/providers/gemini.provider");
        expect(provider.isConfigured()).toBe(false);

        jest.resetModules();
        process.env.GEMINI_API_KEY = "gm-test";
        provider = require("../../../src/modules/ai/providers/gemini.provider");
        expect(provider.isConfigured()).toBe(true);
    });

    it("translates the shared {system, messages} shape into Gemini's systemInstruction/contents shape", async () => {
        process.env.GEMINI_API_KEY = "gm-test";
        const provider = require("../../../src/modules/ai/providers/gemini.provider");

        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: "hello from gemini" }] } }],
                usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6 }
            })
        });
        global.fetch = fetchMock;

        const result = await provider.complete({
            system: "sys",
            messages: [
                { role: "user", content: "hi" },
                { role: "assistant", content: "prior reply" }
            ],
            maxTokens: 300
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, requestInit] = fetchMock.mock.calls[0];
        expect(url).toContain("generativelanguage.googleapis.com");
        expect(url).toContain("key=gm-test");

        const body = JSON.parse(requestInit.body);
        expect(body.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
        expect(body.contents).toEqual([
            { role: "user", parts: [{ text: "hi" }] },
            { role: "model", parts: [{ text: "prior reply" }] }
        ]);
        expect(body.generationConfig.maxOutputTokens).toBe(300);

        expect(result).toEqual({ text: "hello from gemini", inputTokens: 12, outputTokens: 6 });
    });

    it("throws on a non-ok response so ai.service.js's callProvider falls back", async () => {
        process.env.GEMINI_API_KEY = "gm-test";
        const provider = require("../../../src/modules/ai/providers/gemini.provider");

        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => "bad request"
        });

        await expect(
            provider.complete({ system: "sys", messages: [{ role: "user", content: "hi" }] })
        ).rejects.toThrow(/Gemini API error 400/);
    });
});
