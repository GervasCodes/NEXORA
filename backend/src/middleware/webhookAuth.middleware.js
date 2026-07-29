// Verifies a mobile money webhook actually came from the provider, not
// from anyone who guessed the URL. Before this, malipopayWebhook and
// selcomWebhook accepted any POST with no verification at all - a
// request like:
//
//   POST /api/v1/payments/webhooks/malipopay
//   { "reference": "ORDER-123", "status": "SUCCESS" }
//
// ...from ANYONE, not just MalipoPay's servers, would mark order #123 as
// paid (or a seller's verification fee as paid) with no money having
// actually moved. That's a critical hole for a payments feature.
//
// This checks a shared secret sent as a header, which you configure on
// the provider's side as a custom webhook header (most providers support
// this - check MalipoPay/Selcom's dashboard for "custom headers" or
// "webhook secret" on the callback URL setup). It's a portable baseline
// that works regardless of provider; if MalipoPay/Selcom instead sign
// requests with HMAC over the body (many do), swap this for verifying
// that signature once you have their real webhook documentation/sandbox
// access - that's strictly stronger than a static shared secret.
//
// Required env vars: MALIPOPAY_WEBHOOK_SECRET, SELCOM_WEBHOOK_SECRET.
// If a secret isn't configured, the webhook is REJECTED in production
// (fails closed, not open) - it's only allowed through unset in
// development, so local testing with a fake payload still works without
// needing a secret configured.

const verifyWebhookSecret = (envVarName) => (req, res, next) => {
    const configuredSecret = process.env[envVarName];
    const providedSecret = req.headers["x-webhook-secret"];

    if (!configuredSecret) {
        if (process.env.NODE_ENV === "production") {
            console.error(`[webhook auth] ${envVarName} is not set - rejecting webhook in production (fail closed).`);
            return res.status(200).json({ success: false });
        }
        // Not configured outside production - allow through so local/dev
        // testing with a hand-crafted payload doesn't require secrets.
        return next();
    }

    if (providedSecret !== configuredSecret) {
        console.error(`[webhook auth] Rejected webhook with invalid/missing x-webhook-secret header.`);
        // 200, not 401: same reasoning as the webhook handlers themselves -
        // a real provider retry-storms on non-2xx, and a rejected forgery
        // doesn't need to look any different to the caller than a
        // processed one.
        return res.status(200).json({ success: false });
    }

    next();
};

exports.verifyMalipopayWebhook = verifyWebhookSecret("MALIPOPAY_WEBHOOK_SECRET");
exports.verifySelcomWebhook = verifyWebhookSecret("SELCOM_WEBHOOK_SECRET");
