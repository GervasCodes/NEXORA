// Verifies a mobile money webhook actually came from the provider, not
// from anyone who guessed the URL. Before the first version of this
// file, malipopayWebhook and selcomWebhook accepted any POST with no
// verification at all - a request like:
//
//   POST /api/v1/payments/webhooks/malipopay
//   { "reference": "ORDER-123", "status": "SUCCESS" }
//
// ...from ANYONE, not just MalipoPay's servers, would mark order #123 as
// paid (or a seller's verification fee as paid) with no money having
// actually moved. That's a critical hole for a payments feature.
//
// This version verifies each provider's REAL documented mechanism
// (confirmed against developers.malipopay.co.tz and
// developers.selcommobile.com on 2026-08-02) instead of a generic
// shared-secret header - the previous version's fallback, kept below as
// verifySharedSecretHeader in case either provider's actual behavior in
// your sandbox doesn't match their public docs and you need a portable
// baseline while you sort that out with their support team.
//
// STILL VERIFY AGAINST A REAL SANDBOX BEFORE GOING LIVE. Docs and actual
// server behavior can drift, especially for Selcom, where the C2B
// Payment Notification API is described as requiring a static
// "Authorization: Bearer $token" per developers.selcommobile.com, but
// full access to that page requires a business relationship with Selcom
// (see selcom.provider.js's header comment) - confirm the exact header
// name/format they actually send once you're onboarded.

const crypto = require("crypto");
const logger = require("../utils/logger");

// --- MalipoPay --------------------------------------------------------
// Per developers.malipopay.co.tz/integration/webhooks: every callback
// body includes a `payloadSignature` field, computed as
//   SHA256(reference + timestamp + amount + phoneNumber + secret)
// where `secret` is the same project API secret used as the `apiToken`
// header on outbound requests (malipopay.provider.js's own header
// comment: MalipoPay has one key, not a separate secret+key pair).
exports.verifyMalipopayWebhook = (req, res, next) => {
    const secret = process.env.MOBILE_MONEY_API_KEY;
    const payload = req.body || {};
    const { reference, timestamp, amount, customer, payloadSignature } = payload;

    if (!secret) {
        if (process.env.NODE_ENV === "production") {
            logger.error({ provider: "malipopay", reqId: req.id }, "[webhook auth] MOBILE_MONEY_API_KEY not configured - rejecting webhook in production (fail closed)");
            return res.status(200).json({ success: false });
        }
        // Not configured outside production - allow through so local/dev
        // testing with a hand-crafted payload doesn't require a secret.
        return next();
    }

    if (!payloadSignature || !customer?.phoneNumber) {
        logger.warn({ provider: "malipopay", reqId: req.id, ip: req.ip }, "[webhook auth] rejected malipopay webhook missing payloadSignature or customer.phoneNumber");
        return res.status(200).json({ success: false });
    }

    const computed = crypto
        .createHash("sha256")
        .update(`${reference}${timestamp}${amount}${customer.phoneNumber}${secret}`)
        .digest("hex");

    const expected = Buffer.from(computed, "utf8");
    const provided = Buffer.from(String(payloadSignature), "utf8");

    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        // Logged at warn, not error: an unmatched signature here is
        // expected background noise (scanners/bots probing known webhook
        // paths), not an application fault - see the same reasoning in
        // errorHandler.js for the warn/error split.
        logger.warn({ provider: "malipopay", reqId: req.id, ip: req.ip }, "[webhook auth] rejected malipopay webhook with invalid payloadSignature");
        // 200, not 401: a real provider retry-storms on non-2xx, and a
        // rejected forgery doesn't need to look any different to the
        // caller than a processed one.
        return res.status(200).json({ success: false });
    }

    next();
};

// --- Selcom -------------------------------------------------------------
// Per developers.selcommobile.com's C2B/Collection Services section, the
// Payment Notification callback (which is what selcomWebhook.js's
// payload shape - transid/resultcode/result - matches) authenticates
// with a static bearer token Selcom's team shares with you directly, not
// a per-request signature:
//   Authorization: Bearer <token>
exports.verifySelcomWebhook = (req, res, next) => {
    const configuredToken = process.env.SELCOM_WEBHOOK_SECRET;
    const authHeader = req.headers.authorization || "";
    const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!configuredToken) {
        if (process.env.NODE_ENV === "production") {
            logger.error({ provider: "selcom", reqId: req.id }, "[webhook auth] SELCOM_WEBHOOK_SECRET not configured - rejecting webhook in production (fail closed)");
            return res.status(200).json({ success: false });
        }
        return next();
    }

    const expected = Buffer.from(configuredToken, "utf8");
    const provided = Buffer.from(providedToken || "", "utf8");

    if (!providedToken || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        logger.warn({ provider: "selcom", reqId: req.id, ip: req.ip }, "[webhook auth] rejected selcom webhook with invalid/missing Authorization bearer token");
        return res.status(200).json({ success: false });
    }

    next();
};

// --- Fallback: generic shared-secret header ----------------------------
// Not wired up to any route by default. Available if either provider's
// real sandbox behavior turns out to differ from their public docs above
// and you need something working while that gets sorted out with their
// support team - configure a custom webhook header on their side (check
// their dashboard's callback URL settings for "custom headers") and swap
// the relevant route in payment.routes.js back to this.
const verifyWebhookSecret = (envVarName, provider) => (req, res, next) => {
    const configuredSecret = process.env[envVarName];
    const providedSecret = req.headers["x-webhook-secret"];

    if (!configuredSecret) {
        if (process.env.NODE_ENV === "production") {
            logger.error({ provider, envVarName, reqId: req.id }, "[webhook auth] secret not configured - rejecting webhook in production (fail closed)");
            return res.status(200).json({ success: false });
        }
        return next();
    }

    if (providedSecret !== configuredSecret) {
        logger.warn({ provider, reqId: req.id, ip: req.ip }, "[webhook auth] rejected webhook with invalid/missing x-webhook-secret header");
        return res.status(200).json({ success: false });
    }

    next();
};

exports.verifySharedSecretHeader = verifyWebhookSecret;
