// OpenAI-compatible adapter - the second pluggable provider (see
// registry.js). AI_PROVIDER_BASE_URL lets this same adapter target any
// OpenAI-compatible endpoint (OpenAI itself, Azure OpenAI, a
// self-hosted gateway) without a code change, matching the codebase's
// existing preference for env-configured behavior over hardcoded
// vendors (see payment/providers for the same philosophy).
const MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const BASE_URL = process.env.AI_PROVIDER_BASE_URL || "https://api.openai.com/v1";
const TIMEOUT_MS = 8000;

exports.name = "openai";

exports.isConfigured = () => Boolean(process.env.OPENAI_API_KEY);

// Same { system, messages, maxTokens } -> { text, inputTokens, outputTokens }
// contract as anthropic.provider.js - ai.service.js is written against
// this shared shape, not either vendor's native response format.
exports.complete = async ({ system, messages, maxTokens = 500 }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: maxTokens,
                messages: [{ role: "system", content: system }, ...messages]
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`OpenAI-compatible API error ${response.status}: ${body.slice(0, 200)}`);
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
