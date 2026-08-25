// Groq adapter - one of the pluggable AI providers (see registry.js).
// Groq exposes an OpenAI-compatible chat/completions endpoint, so the
// request/response shapes below mirror openai.provider.js rather than
// introducing a new format.
const MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 8000;

exports.name = "groq";

exports.isConfigured = () => Boolean(process.env.GROQ_API_KEY);

// Same { system, messages, maxTokens } -> { text, inputTokens, outputTokens }
// contract as the other providers - ai.service.js is written against this
// shared shape, not any vendor's native response format.
exports.complete = async ({ system, messages, maxTokens = 500 }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`
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
            throw new Error(`Groq API error ${response.status}: ${body.slice(0, 200)}`);
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
