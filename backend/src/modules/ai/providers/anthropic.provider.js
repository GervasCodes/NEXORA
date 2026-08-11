// Anthropic (Claude) adapter - one of two pluggable AI providers (see
// registry.js). Uses global fetch (Node >=18, matches package.json's
// engines field) rather than adding an SDK dependency for one endpoint.
const MODEL = process.env.AI_MODEL || "claude-sonnet-4-5-20250929";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 8000;

exports.name = "anthropic";

exports.isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

// { system, messages: [{role, content}], maxTokens } -> { text, inputTokens, outputTokens }
// Throws on any failure - callers (ai.service.js) are responsible for
// catching this and falling back to non-AI behavior; this file never
// swallows an error into a fake success.
exports.complete = async ({ system, messages, maxTokens = 500 }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: maxTokens,
                system,
                messages
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = await response.json();
        const text = (data.content || [])
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("\n");

        return {
            text,
            inputTokens: data.usage?.input_tokens || 0,
            outputTokens: data.usage?.output_tokens || 0
        };
    } finally {
        clearTimeout(timeout);
    }
};
