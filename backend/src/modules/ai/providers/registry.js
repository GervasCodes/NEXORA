/**
 * AI-provider registry  deliberately mirrors
 * payment/providers/registry.js: a single place to answer "is any
 * provider actually configured right now", so every AI feature falls
 * back to its non-AI behavior instead of guessing.
 *
 * AI_PROVIDER selects which adapter to even consider ("anthropic" |
 * "openai" | "gemini" | "groq" | "openrouter"); unset (the default for a
 * fresh checkout of this phase) means no provider is wired up at all,
 * and getActiveProvider() returns null. Each adapter additionally checks
 * its own API-key env var via isConfigured() - AI_PROVIDER=anthropic
 * with no ANTHROPIC_API_KEY set still resolves to "no active provider",
 * not a crash.
 */

const anthropicProvider = require("./anthropic.provider");
const openaiProvider = require("./openai.provider");
const geminiProvider = require("./gemini.provider");
const groqProvider = require("./groq.provider");
const openrouterProvider = require("./openrouter.provider");

const PROVIDERS = {
    anthropic: anthropicProvider,
    openai: openaiProvider,
    gemini: geminiProvider,
    groq: groqProvider,
    openrouter: openrouterProvider
};

// Returns the configured provider's adapter, or null if AI_PROVIDER is
// unset/unrecognized, or set but its own credentials aren't. Every
// ai.service.js function checks this first and uses its own template-
// based fallback when it's null - see ai.service.js#callProvider.
exports.getActiveProvider = () => {
    const selected = process.env.AI_PROVIDER;
    if (!selected) return null;

    const provider = PROVIDERS[selected];
    if (!provider || !provider.isConfigured()) return null;

    return provider;
};

exports.isAnyConfigured = () => Boolean(exports.getActiveProvider());

// Phase 5 (production error fixes): a small, opt-in escape hatch for the
// handful of features that need to prefer a specific provider over
// whatever AI_PROVIDER is globally set to - e.g. when the global
// provider is hitting a hard quota ceiling (429s) but is otherwise fine
// for lower-volume features, so it isn't worth flipping AI_PROVIDER
// itself. `names` is tried in order; the first entry that's both a
// recognized key AND passes its own isConfigured() wins. Returns null
// (same contract as getActiveProvider) if none of them are usable, so
// callers can fall through to their existing non-AI template behavior
// exactly as before. Does not change getActiveProvider() or any
// feature that doesn't explicitly opt in.
exports.getProviderChain = (names = []) => {
    for (const name of names) {
        const provider = PROVIDERS[name];
        if (provider && provider.isConfigured()) return provider;
    }
    return null;
};

// Fail-fast startup check (mirrors paymentProviderRegistry.validateRegistry
// in server.js) - catches AI_PROVIDER set to a typo'd/unsupported value
// loudly at boot instead of every AI request silently falling back.
exports.validateRegistry = (logger) => {
    const selected = process.env.AI_PROVIDER;
    if (!selected) return;

    if (!PROVIDERS[selected]) {
        logger.warn(
            { AI_PROVIDER: selected, supported: Object.keys(PROVIDERS) },
            "[ai] AI_PROVIDER is set to an unrecognized value - Nexora AI features will fall back to non-AI behavior"
        );
        return;
    }

    if (!PROVIDERS[selected].isConfigured()) {
        logger.warn(
            { AI_PROVIDER: selected },
            "[ai] AI_PROVIDER is set but its credentials env var is missing - Nexora AI features will fall back to non-AI behavior"
        );
    }
};
