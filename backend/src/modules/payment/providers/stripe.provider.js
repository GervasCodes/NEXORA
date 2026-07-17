/**
 * Stripe provider - card payments (order checkout AND the seller
 * verification fee use this same module; the caller just passes a
 * different `reference` / amount / description).
 *
 * Uses Stripe Checkout (hosted, redirect-based) rather than raw
 * PaymentIntents + custom card form - far less PCI surface area for us
 * to worry about, and Stripe keeps the checkout UI up to date on our
 * behalf.
 *
 * Stripe supports TZS directly as a presentment currency (2-decimal,
 * not zero-decimal), so - unlike PayPal, see paypal.provider.js - no
 * currency conversion is needed here. Amounts are passed to Stripe in
 * the smallest unit (cents-equivalent), so a 15000.00 TZS charge is
 * sent as 1500000.
 */

const getClient = () => {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    const Stripe = require("stripe");
    return new Stripe(process.env.STRIPE_SECRET_KEY);
};

exports.isConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

// amountTzs: decimal TZS amount (e.g. 15000.00)
// reference: our own reference string ("ORDER-42" / "VERIFY-7") - stashed
// as both `client_reference_id` and in `metadata.reference` so the
// webhook handler can recover it however is more convenient.
exports.createCheckoutSession = async ({ amountTzs, reference, description, successUrl, cancelUrl }) => {
    const stripe = getClient();

    if (!stripe) {
        throw new Error("Stripe is not configured");
    }

    const unitAmount = Math.round(Number(amountTzs) * 100);

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: reference,
        metadata: { reference },
        line_items: [
            {
                price_data: {
                    currency: "tzs",
                    unit_amount: unitAmount,
                    product_data: { name: description || "NEXORA payment" }
                },
                quantity: 1
            }
        ],
        success_url: successUrl,
        cancel_url: cancelUrl
    });

    return { success: true, sessionId: session.id, url: session.url };
};

// Verifies the webhook actually came from Stripe (signed with
// STRIPE_WEBHOOK_SECRET) and returns the parsed event. Throws if the
// signature is missing/invalid - the caller should treat that as a
// rejected/forged webhook, not a real Stripe event.
exports.constructWebhookEvent = (rawBody, signatureHeader) => {
    const stripe = getClient();

    if (!stripe) {
        throw new Error("Stripe is not configured");
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not set - refusing to accept an unverifiable webhook");
    }

    return stripe.webhooks.constructEvent(
        rawBody,
        signatureHeader,
        process.env.STRIPE_WEBHOOK_SECRET
    );
};
