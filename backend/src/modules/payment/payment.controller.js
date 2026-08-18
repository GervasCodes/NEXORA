const paymentService = require("./payment.service");
const logger = require("../../utils/logger").child({ module: "payment-webhook" });
const Sentry = require("../../config/sentry");
// Phase 7 (Security) - this used to be a private copy of the same check
// duplicated in subscription.controller.js (which wasn't applying it at
// all - see that file). Now shared from one place - see
// utils/redirectValidator.js's header comment for why.
const { assertAllowedRedirect } = require("../../utils/redirectValidator");

exports.initiateMobileMoneyPayment = async (req, res) => {
    try {
        const result = await paymentService.initiateMobileMoneyPayment(
            req.params.orderId,
            req.user.id
        );

        return res.status(201).json({
            success: true,
            message: result.message,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 5 (Resilience & Growth). No orderId/auth-role restriction beyond
// being logged in - this just reports which rails are configured, not
// anything about the requesting user's own orders.
exports.getAvailablePaymentMethods = async (req, res) => {
    try {
        const methods = paymentService.getAvailablePaymentMethods();

        return res.json({
            success: true,
            data: methods
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getPayment = async (req, res) => {
    try {
        const payment = await paymentService.getPayment(
            req.params.orderId,
            req.user.id
        );

        return res.json({
            success: true,
            data: payment
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

// MalipoPay calls this URL directly (server-to-server) when a buyer's
// payment on their phone completes, fails, or is cancelled. Give MalipoPay
// this exact path in their dashboard's "Callback URL" setting:
//   https://<your-domain>/api/v1/payments/webhooks/malipopay
//
// Signature verification happens BEFORE this handler runs - see
// verifyMalipopayWebhook in webhookAuth.middleware.js (SHA256 of
// reference+timestamp+amount+phoneNumber+secret, per
// developers.malipopay.co.tz/integration/webhooks) wired in as this
// route's middleware in payment.routes.js. This handler only needs to
// shape-check the fields it reads, on top of that - see
// docs/WEBHOOK_VALIDATION.md §1/§6 for the full verification writeup
// and what's still unconfirmed against a live sandbox.
exports.malipopayWebhook = async (req, res) => {
    try {
        const payload = req.body || {};

        // Phase 7 (Security) - the signature check upstream proves this
        // request came from MalipoPay at some point; it doesn't prove
        // `reference` is the well-formed string handleProviderWebhook's
        // ORDER-/VERIFY-/BOOKING-/SUB- regex match expects. A malformed
        // or missing reference here should be a clean "ignored", not an
        // unhandled exception logged as an application error.
        if (typeof payload.reference !== "string" || !payload.reference) {
            logger.warn({ provider: "malipopay", reqId: req.id }, "[webhook] malipopay payload missing/invalid reference field");
            return res.status(200).json({ success: false });
        }

        await paymentService.handleProviderWebhook({
            providerReference: payload.reference,
            success: payload.status === "SUCCESS" || payload.status === "success",
            transactionReference: payload.transactionReference || payload.reference
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ err: error, provider: "malipopay", reqId: req.id }, "MalipoPay webhook error");
        Sentry.captureException(error, { tags: { area: "payment-webhook", provider: "malipopay" } });
        // Still 200 so MalipoPay doesn't retry-storm on our own bug; the
        // error is logged above for us to investigate.
        return res.status(200).json({ success: false });
    }
};

// Selcom's equivalent - give them:
//   https://<your-domain>/api/v1/payments/webhooks/selcom
// Signature verification (Bearer token auth, per
// developers.selcommobile.com's C2B Payment Notification API) happens
// upstream in verifySelcomWebhook - see docs/WEBHOOK_VALIDATION.md §1/§6.
exports.selcomWebhook = async (req, res) => {
    try {
        const payload = req.body || {};

        // Same reasoning as malipopayWebhook above - upstream auth
        // proves provenance, not shape.
        if (typeof payload.transid !== "string" || !payload.transid) {
            logger.warn({ provider: "selcom", reqId: req.id }, "[webhook] selcom payload missing/invalid transid field");
            return res.status(200).json({ success: false });
        }

        await paymentService.handleProviderWebhook({
            providerReference: payload.transid,
            success: payload.resultcode === "000" || payload.result === "SUCCESS",
            transactionReference: payload.reference || payload.transid
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ err: error, provider: "selcom", reqId: req.id }, "Selcom webhook error");
        Sentry.captureException(error, { tags: { area: "payment-webhook", provider: "selcom" } });
        return res.status(200).json({ success: false });
    }
};

// --- Snippe ---------------------------------------------------------

exports.initiateSnippeOrderPayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiateSnippeOrderPayment(
            req.params.orderId,
            req.user.id,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.initiateSnippeVerificationFeePayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");
        const settingsService = require("../settings/settings.service");
        const amount = await settingsService.getVerificationFee();

        const result = await paymentService.initiateSnippeVerificationFeePayment(
            req.user.id,
            amount,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Snippe calls this URL directly (server-to-server), signed with
// SNIPPE_WEBHOOK_SECRET. Give Snippe this exact path in their dashboard:
//   https://<your-domain>/api/v1/payments/webhooks/snippe
//
// IMPORTANT: this route must receive the RAW request body (not JSON-
// parsed) for signature verification to work - see the express.raw()
// wiring in payment.routes.js.
exports.snippeWebhook = async (req, res) => {
    try {
        const snippeProvider = require("./providers/snippe.provider");
        const replayGuard = require("../../utils/webhookReplayGuard");
        const event = snippeProvider.constructWebhookEvent(req.body, req.headers["snippe-signature"]);

        // Phase 2 (Security Hardening) - replay protection. HMAC
        // signature verification above proves this came from Snippe; it
        // doesn't prove this exact delivery hasn't already been consumed
        // (a captured, validly-signed request replayed later would still
        // pass it). If the event carries a `created` timestamp (the
        // commonly documented shape for a hosted-checkout event, same
        // caveat as the rest of this provider's integration - see
        // snippe.provider.js's header comment), reject anything
        // stale/future first; either way, dedup on the raw request bytes
        // themselves (req.body is still the raw Buffer here - see the
        // express.raw() wiring in app.js) so a byte-for-byte replay is
        // caught even if this event shape turns out not to include a
        // timestamp at all.
        if (!replayGuard.isTimestampFresh(event.created)) {
            logger.warn({ provider: "snippe", reqId: req.id }, "Snippe webhook rejected: stale/future event timestamp (possible replay)");
            Sentry.captureMessage("Snippe webhook rejected", {
                level: "warning",
                tags: { area: "payment-webhook", provider: "snippe" },
                extra: { reason: "stale timestamp" }
            });
            return res.status(400).json({ success: false });
        }

        const isFreshDelivery = await replayGuard.recordDelivery("snippe", req.body);
        if (!isFreshDelivery) {
            return res.status(400).json({ success: false });
        }

        await paymentService.handleSnippeWebhookEvent(event);

        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ err: error, provider: "snippe", reqId: req.id }, "Snippe webhook error");
        // Not sent to Sentry as an exception: an invalid-signature
        // rejection here is usually a forged/replayed request rather
        // than an application bug (same reasoning as
        // webhookAuth.middleware.js's warn-level log for the mobile
        // money providers) - captureMessage at warning level keeps it
        // visible without treating every rejected forgery as an
        // incident.
        Sentry.captureMessage("Snippe webhook rejected", {
            level: "warning",
            tags: { area: "payment-webhook", provider: "snippe" },
            extra: { reason: error.message }
        });
        // 400 here (unlike the mobile money webhooks) is correct: an
        // invalid signature means this request didn't come from Snippe,
        // and a 4xx on a signature failure is what we want (it won't
        // retry a request that will never become valid).
        return res.status(400).json({ success: false });
    }
};

// --- MalipoPay Card ---------------------------------------------------
// A separate card-checkout product from MalipoPay's mobile-money rail
// (see malipopayWebhook above / malipopayCard.provider.js's header
// comment) - own routes, own webhook, own credentials.

exports.initiateMalipopayCardOrderPayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiateMalipopayCardOrderPayment(
            req.params.orderId,
            req.user.id,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.initiateMalipopayCardVerificationFeePayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");
        const settingsService = require("../settings/settings.service");
        const amount = await settingsService.getVerificationFee();

        const result = await paymentService.initiateMalipopayCardVerificationFeePayment(
            req.user.id,
            amount,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// MalipoPay calls this URL directly (server-to-server), signed with
// MALIPOPAY_CARD_WEBHOOK_SECRET. Give MalipoPay this exact path in their
// dashboard's card-product webhook setting:
//   https://<your-domain>/api/v1/payments/webhooks/malipopay-card
//
// IMPORTANT: this route must receive the RAW request body (not JSON-
// parsed) for signature verification to work - see the express.raw()
// wiring in app.js, mirroring the Snippe webhook exactly.
exports.malipopayCardWebhook = async (req, res) => {
    try {
        const malipopayCardProvider = require("./providers/malipopayCard.provider");
        const replayGuard = require("../../utils/webhookReplayGuard");
        // Real header name confirmed via MalipoPay's official malipopay-php
        // SDK (reads HTTP_X_MALIPOPAY_SIGNATURE) - see
        // malipopayCard.provider.js's file header for the full rundown of
        // what else changed in this rewrite. Express lower-cases incoming
        // header names, so this is read as all-lowercase.
        const event = malipopayCardProvider.constructWebhookEvent(req.body, req.headers["x-malipopay-signature"]);

        // Same replay protection as the Snippe webhook - see the comment
        // there and webhookReplayGuard.js for the full reasoning.
        if (!replayGuard.isTimestampFresh(event.created)) {
            logger.warn({ provider: "malipopay-card", reqId: req.id }, "MalipoPay Card webhook rejected: stale/future event timestamp (possible replay)");
            Sentry.captureMessage("MalipoPay Card webhook rejected", {
                level: "warning",
                tags: { area: "payment-webhook", provider: "malipopay-card" },
                extra: { reason: "stale timestamp" }
            });
            return res.status(400).json({ success: false });
        }

        const isFreshDelivery = await replayGuard.recordDelivery("malipopay-card", req.body);
        if (!isFreshDelivery) {
            return res.status(400).json({ success: false });
        }

        await paymentService.handleMalipopayCardWebhookEvent(event);

        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ err: error, provider: "malipopay-card", reqId: req.id }, "MalipoPay Card webhook error");
        Sentry.captureMessage("MalipoPay Card webhook rejected", {
            level: "warning",
            tags: { area: "payment-webhook", provider: "malipopay-card" },
            extra: { reason: error.message }
        });
        // 400 here (unlike the mobile money webhooks) is correct: an
        // invalid signature means this request didn't come from
        // MalipoPay's card product, same reasoning as the Snippe webhook.
        return res.status(400).json({ success: false });
    }
};

// --- PayPal ---------------------------------------------------------

exports.initiatePaypalOrderPayment = async (req, res) => {
    try {
        const returnUrl = assertAllowedRedirect(req.body.returnUrl, "returnUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiatePaypalOrderPayment(
            req.params.orderId,
            req.user.id,
            { returnUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.initiatePaypalVerificationFeePayment = async (req, res) => {
    try {
        const returnUrl = assertAllowedRedirect(req.body.returnUrl, "returnUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");
        const settingsService = require("../settings/settings.service");
        const amount = await settingsService.getVerificationFee();

        const result = await paymentService.initiatePaypalVerificationFeePayment(
            req.user.id,
            amount,
            { returnUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Called by OUR OWN frontend after the buyer/seller is redirected back
// from PayPal's approval page - this is what actually captures the
// funds server-side. Never trust the redirect itself as proof of
// payment; PayPal's capture response is the only thing that matters.
exports.capturePaypalPayment = async (req, res) => {
    try {
        const result = await paymentService.capturePaypalPayment(req.body.paypalOrderId);

        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Booking payments (Phase 3 - Financial Integration) ---------------------

exports.initiateMobileMoneyBookingPayment = async (req, res) => {
    try {
        const result = await paymentService.initiateMobileMoneyBookingPayment(
            req.params.bookingId,
            req.user.id,
            req.body.phone
        );

        return res.status(201).json({
            success: true,
            message: result.message,
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.initiateSnippeBookingPayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiateSnippeBookingPayment(
            req.params.bookingId,
            req.user.id,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.initiateMalipopayCardBookingPayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiateMalipopayCardBookingPayment(
            req.params.bookingId,
            req.user.id,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.initiatePaypalBookingPayment = async (req, res) => {
    try {
        const returnUrl = assertAllowedRedirect(req.body.returnUrl, "returnUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiatePaypalBookingPayment(
            req.params.bookingId,
            req.user.id,
            { returnUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getBookingPayment = async (req, res) => {
    try {
        const payment = await paymentService.getBookingPayment(
            req.params.bookingId,
            req.user.id
        );

        return res.json({ success: true, data: payment });
    } catch (error) {
        return res.status(404).json({ success: false, message: error.message });
    }
};

exports.confirmDeliveryReceipt = async (req, res) => {
    try {
        const result = await paymentService.confirmDeliveryReceipt(
            req.params.orderId,
            req.user.id
        );

        return res.json({
            success: true,
            message: result.paymentConfirmed
                ? "Receipt confirmed - Cash on Delivery payment recorded"
                : "Receipt confirmed",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};