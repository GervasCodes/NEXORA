// Verifies a payment webhook actually came from the provider, not from
// anyone who guessed the URL. Without verification, a request like:
//
//   POST /api/v1/payments/webhooks/selcom
//   { "order_id": "ORDER-123-...", "result": "SUCCESS" }
//
// ...from ANYONE would mark order #123 as paid with no money having moved -
// a critical hole for a payments feature.
//
// Each provider's own mechanism is used:
//   Selcom  - static bearer token (+ optional IP allow-list)
//   AzamPay - shared secret in a header or the callback URL (+ optional IPs)
//   PawaPay - RFC 9421 signed callbacks, verified in payment.controller.js
//             because they need the raw body (see pawapay.provider.js)
//
// All of them fail CLOSED when their secret is not configured. STILL VERIFY
// AGAINST A REAL SANDBOX BEFORE GOING LIVE: docs and actual server behavior
// can drift. verifySharedSecretHeader below is a portable fallback if a
// provider's real behavior differs from its docs.

const crypto = require("crypto");
const logger = require("../utils/logger");
const replayGuard = require("../utils/webhookReplayGuard");

// Fail closed everywhere: a webhook whose secret is not configured is
// rejected in EVERY environment. The one exception is local development,
// which must opt in explicitly with ALLOW_UNSIGNED_WEBHOOKS=true - and even
// that is ignored in production.
const allowUnsignedForLocalDev = () =>
    process.env.ALLOW_UNSIGNED_WEBHOOKS === "true" && process.env.NODE_ENV !== "production";

// Selcom's bearer token is static, so also restrict by source IP when an
// allow-list is configured (SELCOM_WEBHOOK_ALLOWED_IPS, comma separated).
const sourceIpAllowed = (req, envVarName) => {
    const allowList = String(process.env[envVarName] || "").split(",").map((ip) => ip.trim()).filter(Boolean);
    if (allowList.length === 0) return true;
    const ip = String(req.ip || "").replace(/^::ffff:/, "");
    return allowList.includes(ip);
};

// --- Selcom -------------------------------------------------------------
// Per developers.selcommobile.com's C2B/Collection Services section, the
// Payment Notification callback (which is what selcomWebhook.js's
// payload shape - transid/resultcode/result - matches) authenticates
// with a static bearer token Selcom's team shares with you directly, not
// a per-request signature:
//   Authorization: Bearer <token>
exports.verifySelcomWebhook = async (req, res, next) => {
    const configuredToken = process.env.SELCOM_WEBHOOK_SECRET;
    const authHeader = req.headers.authorization || "";
    const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!configuredToken) {
        if (allowUnsignedForLocalDev()) {
            return next();
        }
        logger.error({ provider: "selcom", reqId: req.id }, "[webhook auth] SELCOM_WEBHOOK_SECRET not configured - rejecting webhook (fail closed; set ALLOW_UNSIGNED_WEBHOOKS=true for local development only)");
        return res.status(200).json({ success: false });
    }

    if (!sourceIpAllowed(req, "SELCOM_WEBHOOK_ALLOWED_IPS")) {
        logger.warn({ provider: "selcom", reqId: req.id, ip: req.ip }, "[webhook auth] rejected selcom webhook from an IP outside SELCOM_WEBHOOK_ALLOWED_IPS");
        return res.status(200).json({ success: false });
    }

    const expected = Buffer.from(configuredToken, "utf8");
    const provided = Buffer.from(providedToken || "", "utf8");

    if (!providedToken || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        logger.warn({ provider: "selcom", reqId: req.id, ip: req.ip }, "[webhook auth] rejected selcom webhook with invalid/missing Authorization bearer token");
        return res.status(200).json({ success: false });
    }

    // (Security Hardening) - replay protection. Selcom's
    // documented C2B payload (transid/resultcode/result) carries no
    // timestamp/nonce of its own (see webhookReplayGuard.js's
    // isTimestampFresh - a no-op when there's nothing to check), so the
    // payload-hash dedup below is this provider's only guard against a
    // captured bearer-token-authenticated request being replayed later.
    try {
        const isFreshDelivery = await replayGuard.recordDelivery("selcom", JSON.stringify(req.body || {}));
        if (!isFreshDelivery) {
            return res.status(200).json({ success: false });
        }
        req.replayGuardKey = { provider: "selcom", raw: JSON.stringify(req.body || {}) };
    } catch (error) {
        logger.error({ err: error, provider: "selcom", reqId: req.id }, "[webhook auth] replay-guard check failed");
        return res.status(200).json({ success: false });
    }

    next();
};

// --- AzamPay ------------------------------------------------------------
// AzamPay's callback carries no signature - authenticity rests on a shared
// secret you embed in the callback URL / header when registering it in the
// AzamPay dashboard. Any one of these is accepted:
//   Authorization: Bearer <AZAMPAY_WEBHOOK_SECRET>
//   x-webhook-secret: <AZAMPAY_WEBHOOK_SECRET>
//   https://<api>/api/v1/payments/webhooks/azampay?secret=<AZAMPAY_WEBHOOK_SECRET>
// Optionally restricted by source IP (AZAMPAY_WEBHOOK_ALLOWED_IPS). Fails
// closed when the secret is not configured.
const secretsEqual = (expected, provided) => {
    const a = Buffer.from(String(expected), "utf8");
    const b = Buffer.from(String(provided || ""), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

exports.verifyAzampayWebhook = async (req, res, next) => {
    const configuredSecret = process.env.AZAMPAY_WEBHOOK_SECRET;

    if (!configuredSecret) {
        if (allowUnsignedForLocalDev()) {
            return next();
        }
        logger.error({ provider: "azampay", reqId: req.id }, "[webhook auth] AZAMPAY_WEBHOOK_SECRET not configured - rejecting webhook (fail closed; set ALLOW_UNSIGNED_WEBHOOKS=true for local development only)");
        return res.status(200).json({ success: false });
    }

    if (!sourceIpAllowed(req, "AZAMPAY_WEBHOOK_ALLOWED_IPS")) {
        logger.warn({ provider: "azampay", reqId: req.id, ip: req.ip }, "[webhook auth] rejected azampay webhook from an IP outside AZAMPAY_WEBHOOK_ALLOWED_IPS");
        return res.status(200).json({ success: false });
    }

    const authHeader = req.headers.authorization || "";
    const candidates = [
        authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null,
        req.headers["x-webhook-secret"],
        req.query && req.query.secret
    ];

    if (!candidates.some((candidate) => candidate && secretsEqual(configuredSecret, candidate))) {
        logger.warn({ provider: "azampay", reqId: req.id, ip: req.ip }, "[webhook auth] rejected azampay webhook with invalid/missing secret");
        return res.status(200).json({ success: false });
    }

    // No timestamp/nonce in AzamPay's payload, so the payload-hash dedup is
    // this route's guard against a captured request being replayed.
    try {
        const raw = JSON.stringify(req.body || {});
        const isFreshDelivery = await replayGuard.recordDelivery("azampay", raw);
        if (!isFreshDelivery) {
            return res.status(200).json({ success: false });
        }
        req.replayGuardKey = { provider: "azampay", raw };
    } catch (error) {
        logger.error({ err: error, provider: "azampay", reqId: req.id }, "[webhook auth] replay-guard check failed");
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
        if (allowUnsignedForLocalDev()) {
            return next();
        }
        logger.error({ provider, envVarName, reqId: req.id }, "[webhook auth] secret not configured - rejecting webhook (fail closed; set ALLOW_UNSIGNED_WEBHOOKS=true for local development only)");
        return res.status(200).json({ success: false });
    }

    // Timing-safe, length-checked comparison - same pattern as
    // verifySelcomWebhook/verifyAzampayWebhook above, even though this
    // fallback isn't currently wired to any route. A plain !== here
    // would be a landmine for whoever wires this up later without
    // noticing the difference.
    const expected = Buffer.from(configuredSecret, "utf8");
    const provided = Buffer.from(String(providedSecret || ""), "utf8");

    if (!providedSecret || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        logger.warn({ provider, reqId: req.id, ip: req.ip }, "[webhook auth] rejected webhook with invalid/missing x-webhook-secret header");
        return res.status(200).json({ success: false });
    }

    next();
};

exports.verifySharedSecretHeader = verifyWebhookSecret;

// --- SMS gateway (Roadmap Phase 1: offer-accept-by-reply) ---------------
// Most SMS gateways (Beem Africa included) don't document a per-request
// body signature for inbound callbacks the way WhatsApp does -
// only a custom header/token you configure on their dashboard's callback
// URL settings. This is the same shape as verifySelcomWebhook above (a
// static shared secret, not a computed signature), plus the same
// payload-hash replay dedup every other webhook in this file gets - see
// webhookReplayGuard.js. There's no provider-supplied timestamp/nonce to
// check freshness against here either, same as Selcom, so the hash dedup
// is (as with Selcom) this route's only guard against a captured,
// validly-authenticated request being replayed later.
exports.verifySmsWebhook = async (req, res, next) => {
    const configuredSecret = process.env.SMS_GATEWAY_WEBHOOK_SECRET;
    const providedSecret = req.headers["x-webhook-secret"];

    if (!configuredSecret) {
        if (allowUnsignedForLocalDev()) {
            return next();
        }
        logger.error({ provider: "sms", reqId: req.id }, "[webhook auth] SMS_GATEWAY_WEBHOOK_SECRET not configured - rejecting webhook (fail closed; set ALLOW_UNSIGNED_WEBHOOKS=true for local development only)");
        return res.status(200).json({ success: false });
    }

    const expected = Buffer.from(configuredSecret, "utf8");
    const provided = Buffer.from(String(providedSecret || ""), "utf8");

    if (!providedSecret || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        logger.warn({ provider: "sms", reqId: req.id, ip: req.ip }, "[webhook auth] rejected sms webhook with invalid/missing x-webhook-secret header");
        return res.status(200).json({ success: false });
    }

    try {
        const isFreshDelivery = await replayGuard.recordDelivery("sms", JSON.stringify(req.body || {}));
        if (!isFreshDelivery) {
            return res.status(200).json({ success: false });
        }
    } catch (error) {
        logger.error({ err: error, provider: "sms", reqId: req.id }, "[webhook auth] replay-guard check failed");
        return res.status(200).json({ success: false });
    }

    next();
};

// --- WhatsApp Cloud API ---------------------------------------------------
// Per developers.facebook.com/docs/graph-api/webhooks/getting-started:
// every webhook delivery includes an X-Hub-Signature-256 header, computed
// as HMAC-SHA256(rawBody, appSecret) - same "hash the raw bytes" shape as
// the PayPal/PawaPay webhooks, so this route needs the same express.raw()
// wiring in app.js those two already use (see the comment there).
exports.verifyWhatsAppWebhook = async (req, res, next) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signatureHeader = req.headers["x-hub-signature-256"];

    if (!appSecret) {
        if (allowUnsignedForLocalDev()) {
            return next();
        }
        logger.error({ provider: "whatsapp", reqId: req.id }, "[webhook auth] WHATSAPP_APP_SECRET not configured - rejecting webhook (fail closed; set ALLOW_UNSIGNED_WEBHOOKS=true for local development only)");
        return res.status(200).send("EVENT_RECEIVED");
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const computed = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

    const expected = Buffer.from(computed, "utf8");
    const provided = Buffer.from(String(signatureHeader || ""), "utf8");

    if (!signatureHeader || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        logger.warn({ provider: "whatsapp", reqId: req.id, ip: req.ip }, "[webhook auth] rejected whatsapp webhook with invalid/missing X-Hub-Signature-256");
        // 200, not 401: Meta retry-storms on non-2xx, same reasoning as
        // the mobile money webhooks above.
        return res.status(200).send("EVENT_RECEIVED");
    }

    // The raw Buffer body needs to be JSON again for whatsapp.controller.js
    // to read message fields off it - express.raw() (wired in app.js)
    // deliberately skips express.json()'s parsing for this one route.
    try {
        req.body = JSON.parse(rawBody.toString("utf8") || "{}");
    } catch (error) {
        return res.status(200).send("EVENT_RECEIVED");
    }

    next();
};
