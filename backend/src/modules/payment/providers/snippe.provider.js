/**
 * Snippe provider - card payments (order checkout AND the seller
 * verification fee use this same module; the caller just passes a
 * different `reference` / amount / description).
 *
 * Uses Snippe's hosted checkout (redirect-based) rather than a raw card
 * form - far less PCI surface area for us to worry about, and Snippe
 * keeps the checkout UI up to date on our behalf. No SDK dependency -
 * plain REST + fetch, same pattern as paypal.provider.js.
 *
 * NOTE: this follows Snippe's commonly documented hosted-checkout
 * pattern (create a session, redirect the buyer to the returned URL,
 * verify webhooks via an HMAC signature header). Confirm the exact
 * field names / endpoint paths / header name against Snippe's real API
 * docs once you're onboarded - the shape below is a reasonable default,
 * not something to trust blindly in production without checking.
 *
 * Amounts are sent to Snippe as a decimal TZS amount (unlike Stripe,
 * which needed the smallest-unit/cents conversion) - adjust here if
 * Snippe's real API expects smallest-unit integers instead.
 */

const crypto = require("crypto");

const baseUrl = () => process.env.SNIPPE_API_BASE_URL || "https://api.snippe.co/v1";

exports.isConfigured = () => Boolean(process.env.SNIPPE_SECRET_KEY);

// amountTzs: decimal TZS amount (e.g. 15000.00)
// reference: our own reference string ("ORDER-42" / "VERIFY-7") - sent
// as both `reference` and echoed back in the webhook payload so the
// webhook handler can recover it however is more convenient.
exports.createCheckoutSession = async ({ amountTzs, reference, description, successUrl, cancelUrl }) => {
    if (!exports.isConfigured()) {
        throw new Error("Snippe is not configured");
    }

    const response = await fetch(`${baseUrl()}/checkout/sessions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.SNIPPE_SECRET_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            amount: Number(amountTzs),
            currency: "TZS",
            reference,
            description: description || "NEXORA payment",
            success_url: successUrl,
            cancel_url: cancelUrl
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Snippe checkout session could not be created");
    }

    return { success: true, sessionId: data.id, url: data.checkout_url || data.url };
};

// Verifies the webhook actually came from Snippe (HMAC-SHA256 over the
// raw request body, signed with SNIPPE_WEBHOOK_SECRET) and returns the
// parsed event. Throws if the signature is missing/invalid - the caller
// should treat that as a rejected/forged webhook, not a real Snippe
// event.
exports.constructWebhookEvent = (rawBody, signatureHeader) => {
    if (!exports.isConfigured()) {
        throw new Error("Snippe is not configured");
    }

    if (!process.env.SNIPPE_WEBHOOK_SECRET) {
        throw new Error("SNIPPE_WEBHOOK_SECRET is not set - refusing to accept an unverifiable webhook");
    }

    if (!signatureHeader) {
        throw new Error("Missing Snippe webhook signature");
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.SNIPPE_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    const providedBuffer = Buffer.from(String(signatureHeader));
    const expectedBuffer = Buffer.from(expectedSignature);

    const signatureValid =
        providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!signatureValid) {
        throw new Error("Invalid Snippe webhook signature");
    }

    return JSON.parse(rawBody.toString("utf8"));
};
