// Google Gemini adapter - one of the pluggable AI providers (see
// registry.js). Gemini's Generative Language API uses its own
// request/response shape (systemInstruction + contents[], not
// OpenAI-style messages[]), so unlike groq/openrouter this cannot reuse
// openai.provider.js's body - it's translated below instead.
const MODEL = process.env.AI_MODEL || "gemini-2.0-flash";
const TIMEOUT_MS = 8000;

exports.name = "gemini";

exports.isConfigured = () => Boolean(process.env.GEMINI_API_KEY);

// Same { system, messages: [{role, content}], maxTokens } -> { text, inputTokens, outputTokens }
// contract as the other providers - ai.service.js only ever sends a
// single { role: "user", content } message today, so the role mapping
// below only needs to cover "user"/"assistant" -> Gemini's "user"/"model".
exports.complete = async ({ system, messages, maxTokens = 500 }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: messages.map((m) => ({
                    role: m.role === "assistant" ? "model" : "user",
                    parts: [{ text: m.content }]
                })),
                generationConfig: { maxOutputTokens: maxTokens }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = await response.json();
        const text = (data.candidates?.[0]?.content?.parts || [])
            .map((part) => part.text || "")
            .join("\n");

        return {
            text,
            inputTokens: data.usageMetadata?.promptTokenCount || 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount || 0
        };
    } finally {
        clearTimeout(timeout);
    }
};
