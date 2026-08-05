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
 * verify webhooks via a signature header) so payment.service.js /
 * payment.controller.js can drive both card rails through parallel
 * functions without inventing a new integration pattern.
 *
 * PHASE 3 REWRITE - the previous version of this file called endpoints
 * that don't exist anywhere in MalipoPay's real API
 * (`/card/checkout/sessions`, `/card/payments/:ref/refund`) and
 * authenticated with `Authorization: Bearer`. Verified against
 * MalipoPay's actual published OpenAPI spec
 * (https://developers.malipopay.co.tz/openapi/malipopay.json) and their
 * official malipopay-php SDK (packagist.org/packages/malipopay/malipopay-php),
 * this has been replaced with:
 *   - the real base URLs: https://core-prod.malipopay.co.tz (production),
 *     https://core-uat.malipopay.co.tz (UAT/sandbox)
 *   - the real auth scheme: an `apiToken` header carrying the secret key
 *     (NOT `Authorization: Bearer`, which MalipoPay's API does not accept
 *     for this kind of key)
 *   - `PUT /api/v1/payment` ("Create a payment link (v2)") for creating a
 *     hosted checkout page, which is MalipoPay's real product for this -
 *     there is no separate "/card/checkout/sessions"-style endpoint
 *   - `GET /api/v1/payment/verify/:reference` for status verification
 *   - `POST /api/v1/payment/disbursement` for refunds - MalipoPay's real
 *     API has **no dedicated refund endpoint at all** (confirmed absent
 *     from their full Payments endpoint list: dashboard, initiate,
 *     list, payment-link, collection, disbursement, approve,
 *     confirm-approval, search, retry, pay-now, verify,
 *     get-by-reference, export - nothing named refund). A "refund" is
 *     issued as a mobile-money disbursement/payout back to the buyer's
 *     phone number instead - see refundPayment below and
 *     refund.service.js's malipopay_card branch, which now fetches the
 *     order's shipping phone number the same way the existing
 *     mobile_money refund branch already did.
 *   - the real webhook signature header name, `X-Malipopay-Signature`
 *
 * MalipoPay's docs render their exact request/response field names via
 * client-side JS (Docusaurus), which a server-side fetch of the page
 * can't see - only the endpoint paths, methods, auth scheme, and base
 * URLs above came back in the raw OpenAPI spec/curl examples and are
 * confirmed correct. The field names below (`amount`, `currency`,
 * `reference`, `description`, `phoneNumber`, `callbackUrl`) follow the
 * pattern MalipoPay's own documented Collection endpoint uses
 * (confirmed via their public quickstart curl example) applied
 * consistently to the payment-link/disbursement endpoints - reasonable,
 * but still worth a quick confirmation against a real sandbox account
 * before relying on this in production, same caveat snippe.provider.js
 * documents for its own integration.
 *
 * Amounts are sent to MalipoPay as a decimal TZS amount, same convention
 * snippe.provider.js uses.
 */

const crypto = require("crypto");

const baseUrl = () =>
    process.env.MALIPOPAY_CARD_API_BASE_URL ||
    (process.env.MALIPOPAY_CARD_ENVIRONMENT === "uat"
        ? "https://core-uat.malipopay.co.tz"
        : "https://core-prod.malipopay.co.tz");

const authHeaders = () => ({
    apiToken: process.env.MALIPOPAY_CARD_SECRET_KEY,
    "Content-Type": "application/json"
});

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
    Boolean(process.env.MALIPOPAY_CARD_SECRET_KEY) &&
    exports.getEnabledBrands().length > 0;

// amountTzs: decimal TZS amount (e.g. 15000.00)
// reference: our own reference string ("ORDER-42" / "VERIFY-7" /
// "BOOKING-15" / "SUB-3") - sent as `reference` and echoed back in the
// webhook payload, same convention as snippe.provider.js.
exports.createCheckoutSession = async ({ amountTzs, reference, description, successUrl, cancelUrl }) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    const response = await fetch(`${baseUrl()}/api/v1/payment`, {
        method: "PUT", // "Create a payment link (v2)" - see file header
        headers: authHeaders(),
        body: JSON.stringify({
            amount: Number(amountTzs),
            currency: "TZS",
            reference,
            description: description || "NEXORA payment",
            callbackUrl: successUrl,
            cancelUrl,
            channel: "CARD",
            supportedBrands: exports.getEnabledBrands()
        })
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "MalipoPay Card checkout session could not be created");
    }

    const payload = data.data || data;
    return { success: true, sessionId: payload.id || payload.reference, url: payload.paymentLink || payload.url };
};

// MalipoPay's real API has no card-refund endpoint (see file header) -
// a refund is a mobile-money disbursement back to the buyer's phone
// number instead, so this now needs the buyer's phone number in
// addition to the original transaction reference. See
// refund.service.js's malipopay_card branch, which now fetches it from
// the order the same way the mobile_money refund branch already did.
//
// transactionReference: the reference stored on the payments row for
// this MalipoPay Card payment (see payment.service.js
// handleMalipopayCardWebhookEvent) - included in the disbursement's
// description/reference for reconciliation, since it's not itself a
// "refundable object" the way a card-network refund would be.
// phoneNumber: the buyer's mobile money number to pay the refund out to.
// amountTzs: decimal TZS amount to refund - full or partial.
exports.refundPayment = async ({ transactionReference, phoneNumber, amountTzs, reason }) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    if (!phoneNumber) {
        return { success: false, refundReference: null, error: "No phone number on file to disburse the refund to" };
    }

    const response = await fetch(`${baseUrl()}/api/v1/payment/disbursement`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            amount: Number(amountTzs),
            currency: "TZS",
            phoneNumber,
            reference: `REFUND-${transactionReference}`,
            description: reason || "dispute_resolution"
        })
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
        return { success: false, refundReference: null, error: data.message || "MalipoPay Card refund (disbursement) failed" };
    }

    const payload = data.data || data;
    return {
        success: payload.status === "SUCCESSFUL" || payload.status === "PROCESSING" || Boolean(payload.success),
        refundReference: payload.reference || payload.id || null
    };
};

// Fallback status check for a checkout session, in case a webhook is
// delayed or missed - uses MalipoPay's real "Verify payment status"
// endpoint (GET /api/v1/payment/verify/:reference) rather than a made-up
// one. reference is whatever was passed as `reference` to
// createCheckoutSession above.
exports.verifyPaymentStatus = async (reference) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    const response = await fetch(`${baseUrl()}/api/v1/payment/verify/${encodeURIComponent(reference)}`, {
        method: "GET",
        headers: authHeaders()
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "Could not verify MalipoPay Card payment status");
    }

    const payload = data.data || data;
    return { status: payload.status, raw: payload };
};

// Verifies the webhook actually came from MalipoPay's card product
// (HMAC-SHA256 over the raw request body, signed with
// MALIPOPAY_CARD_WEBHOOK_SECRET) and returns the parsed event. Throws if
// the signature is missing/invalid - the caller should treat that as a
// rejected/forged webhook, not a real MalipoPay event. Mirrors
// snippe.provider.js#constructWebhookEvent exactly, other than the
// header name - MalipoPay's real header is `X-Malipopay-Signature`,
// confirmed via their official malipopay-php SDK (which reads
// HTTP_X_MALIPOPAY_SIGNATURE) - payment.controller.js reads this header
// and passes it through as signatureHeader.
exports.constructWebhookEvent = (rawBody, signatureHeader) => {
    if (!exports.isConfigured()) {
        throw new Error("MalipoPay Card is not configured");
    }

    if (!process.env.MALIPOPAY_CARD_WEBHOOK_SECRET) {
        throw new Error("MALIPOPAY_CARD_WEBHOOK_SECRET is not set - refusing to accept an unverifiable webhook");
    }

    if (!signatureHeader) {
        throw new Error("Missing MalipoPay Card webhook signature (X-Malipopay-Signature)");
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

