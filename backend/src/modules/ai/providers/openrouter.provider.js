// OpenRouter adapter - one of the pluggable AI providers (see registry.js).
// OpenRouter exposes an OpenAI-compatible chat/completions endpoint that
// routes to whichever underlying model AI_MODEL names (e.g.
// "openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"), so this file
// mirrors openai.provider.js rather than introducing a new format.
// HTTP-Referer/X-Title are optional per OpenRouter's docs (used only for
// their own request-attribution dashboard) - included when configured,
// omitted otherwise, since neither affects the API response.
const MODEL = process.env.AI_MODEL || "openai/gpt-4o-mini";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 8000;

exports.name = "openrouter";

exports.isConfigured = () => Boolean(process.env.OPENROUTER_API_KEY);

// Same { system, messages, maxTokens } -> { text, inputTokens, outputTokens }
// contract as the other providers - ai.service.js is written against this
// shared shape, not any vendor's native response format.
exports.complete = async ({ system, messages, maxTokens = 500 }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
        };
        if (process.env.AI_OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.AI_OPENROUTER_SITE_URL;
        if (process.env.AI_OPENROUTER_SITE_NAME) headers["X-Title"] = process.env.AI_OPENROUTER_SITE_NAME;

        const response = await fetch(API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL,
                max_tokens: maxTokens,
                messages: [{ role: "system", content: system }, ...messages]
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`OpenRouter API error ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = await response.json();
        return {
            text: data.choices?.[0]?.message?.content || "",
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0
        };
    } finally {
        clearTimeout(timeout);
    }
};
