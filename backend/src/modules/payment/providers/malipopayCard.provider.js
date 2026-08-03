/**
 * MalipoPay Card provider - card payments (Visa / Mastercard / American
 * Express / UnionPay) via MalipoPay's hosted checkout.
 *
 * This is a DIFFERENT MalipoPay product from malipopay.provider.js: that
 * module is the mobile-money collection/disbursement rail (routed through
 * mobileMoney.provider.js, configured with MOBILE_MONEY_API_BASE_URL /
 * MOBILE_MONEY_API_KEY). This module is MalipoPay's card-checkout product
 * and is configured, authenticated, and enabled completely independently
 * (separate MALIPOPAY_CARD_* env vars below) - enabling/disabling one has
 * no effect on the other, and both can run at the same time.
 *
 * Follows the exact same hosted-checkout shape as snippe.provider.js on
 * purpose (create a session, redirect the buyer to the returned URL,
 * verify webhooks via an HMAC signature header) so payment.service.js /
 * payment.controller.js can drive both card rails through parallel
 * functions without inventing a new integration pattern.
 *
 * NOTE: this follows MalipoPay's commonly documented hosted-checkout
 * pattern for cards - confirm the exact field names / endpoint paths /
 * header name against MalipoPay's real card-checkout API docs once
 * you're onboarded (https://developers.malipopay.co.tz/), the shape
 * below is a reasonable default, not something to trust blindly in
 * production without checking. Same caveat snippe.provider.js documents
 * for its own integration.
 *
 * Amounts are sent to MalipoPay as a decimal TZS amount, same convention
 * snippe.provider.js uses.
 */

const crypto = require("crypto");

const baseUrl = () => process.env.MALIPOPAY_CARD_API_BASE_URL || "https://api.malipopay.co.tz/v1";

// Per-brand toggles - default to enabled (opt-out, not opt-in) so an
// admin who only sets the base credentials gets all four brands
// MalipoPay's card product supports, matching how every other boolean
// flag in this codebase defaults (see mobileMoney/registry.js). Set the
// var to the literal string "false" to disable a single brand while
// keeping the rest (and the gateway as a whole) enabled.
const isBrandEnabled = (envVar) => process.env[envVar] !== "false";

const BRAND_ENV_VARS = {
    visa: "MALIPOPAY_CARD_VISA_ENABLED",
    mastercard: "MALIPOPAY_CARD_MASTERCARD_ENABLED",
    amex: "MALIPOPAY_CARD_AMEX_ENABLED",
    unionpay: "MALIPOPAY_CARD_UNIONPAY_ENABLED"
};

// The brands an admin has actually left enabled right now - exposed via
// the provider registry so checkout can show "Visa, Mastercard" etc.
// without hardcoding it on the frontend.
exports.getEnabledBrands = () =>
    Object.entries(BRAND_ENV_VARS)
        .filter(([, envVar]) => isBrandEnabled(envVar))
        .map(([brand]) => brand);

// Configured means: credentials are present AND at least one card brand
// is actually enabled - a fully-credentialed integration with every
// brand toggled off has nothing to offer a buyer, so it shouldn't show
// up as a selectable checkout option either.
exports.isConfigured = () =>
    Boolean(process.env.MALIPOPAY_CARD_API_BASE_URL && process.env.MALIPOPAY_CARD_SECRET_KEY) &&
    exports.getEnabledBrands().length > 0;

// amountTzs: decimal TZS amount (e.g. 15000.00)
// reference: our own reference string ("ORDER-42" / "VERIFY-7" /
// "BOOKING-15" / "SUB-3") - sent as both `reference` and echoed back in
// the webhook payload, same convention as snippe.provider.js.
exports.createCheckoutSession = async ({ amountTzs, reference, description, successUrl, cancelUrl }) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    const response = await fetch(`${baseUrl()}/card/checkout/sessions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.MALIPOPAY_CARD_SECRET_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            amount: Number(amountTzs),
            currency: "TZS",
            reference,
            description: description || "NEXORA payment",
            success_url: successUrl,
            cancel_url: cancelUrl,
            supported_brands: exports.getEnabledBrands()
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "MalipoPay Card checkout session could not be created");
    }

    return { success: true, sessionId: data.id, url: data.checkout_url || data.url };
};

// Same hosted-gateway REST convention as snippe.provider.js's
// refundPayment - confirm the exact path/field names against MalipoPay's
// real API docs before relying on this in production.
//
// transactionReference: the reference stored on the payments row for
// this MalipoPay Card payment (see payment.service.js
// handleMalipopayCardWebhookEvent).
// amountTzs: decimal TZS amount to refund - full or partial.
exports.refundPayment = async ({ transactionReference, amountTzs, reason }) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    const response = await fetch(`${baseUrl()}/card/payments/${transactionReference}/refund`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.MALIPOPAY_CARD_SECRET_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            amount: Number(amountTzs),
            reason: reason || "dispute_resolution"
        })
    });

    const data = await response.json();

    if (!response.ok) {
        return { success: false, refundReference: null, error: data.message || "MalipoPay Card refund failed" };
    }

    return {
        success: Boolean(data.success ?? data.status === "succeeded" ?? data.status === "refunded"),
        refundReference: data.id || data.refund_id || null
    };
};

// Verifies the webhook actually came from MalipoPay's card product
// (HMAC-SHA256 over the raw request body, signed with
// MALIPOPAY_CARD_WEBHOOK_SECRET) and returns the parsed event. Throws if
// the signature is missing/invalid - the caller should treat that as a
// rejected/forged webhook, not a real MalipoPay event. Mirrors
// snippe.provider.js#constructWebhookEvent exactly.
exports.constructWebhookEvent = (rawBody, signatureHeader) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    if (!process.env.MALIPOPAY_CARD_WEBHOOK_SECRET) {
        throw new Error("MALIPOPAY_CARD_WEBHOOK_SECRET is not set - refusing to accept an unverifiable webhook");
    }

    if (!signatureHeader) {
        throw new Error("Missing MalipoPay Card webhook signature");
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.MALIPOPAY_CARD_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    const providedBuffer = Buffer.from(String(signatureHeader));
    const expectedBuffer = Buffer.from(expectedSignature);

    const signatureValid =
        providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!signatureValid) {
        throw new Error("Invalid MalipoPay Card webhook signature");
    }

    return JSON.parse(rawBody.toString("utf8"));
};
