// Phase 7 (Security) - extracted from payment.controller.js, which had
// its own private copy of this check (assertAllowedRedirect) already
// applied to every /payments/* endpoint that accepts a client-supplied
// successUrl/cancelUrl/returnUrl. subscription.controller.js's PayPal/
// Snippe/MalipoPay Card subscribe endpoints accept the exact same kind
// of client-supplied redirect but forwarded req.body.returnUrl /
// req.body.successUrl / req.body.cancelUrl straight to the payment
// provider with no check at all - a classic open-redirect: an attacker
// could set successUrl to an external phishing page and, after a real
// payment completes, the victim's browser would be sent there by a
// trusted nexora.example checkout flow. Centralizing the check here (one
// implementation, two call sites) means there's only one place left to
// get this right, instead of two copies that can drift.
//
// Buyers/sellers pass their own return URLs (e.g. the exact order,
// booking, or subscription page they were on) so the payment provider's
// hosted checkout sends them back to the right place - but an unchecked
// client-supplied redirect URL is an open-redirect risk, so only allow
// one whose origin matches a configured CORS_ORIGIN.
const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

exports.assertAllowedRedirect = (url, label) => {
    if (!url) {
        throw new Error(`${label} is required`);
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`${label} is not a valid URL`);
    }
    // Belt-and-braces beyond the origin allowlist below: reject anything
    // that isn't http(s) outright (e.g. "javascript:", "data:") so a
    // same-origin-looking-but-non-navigable scheme can't sneak through
    // if CORS_ORIGIN is ever left unconfigured in a non-production env.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`${label} must use http or https`);
    }
    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
        throw new Error(`${label} is not an allowed redirect destination`);
    }
    return url;
};
