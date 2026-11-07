const paymentService = require("./payment.service");
const providerStatus = require("./providerStatus");
const logger = require("../../utils/logger").child({ module: "payment-webhook" });
const Sentry = require("../../config/sentry");
// (Security) - this used to be a private copy of the same check
// duplicated in subscription.controller.js (which wasn't applying it at
// all - see that file). Now shared from one place - see
// utils/redirectValidator.js's header comment for why.
const { assertAllowedRedirect } = require("../../utils/redirectValidator");

// One policy for a webhook whose processing threw, so every provider
// behaves the same:
//   - permanent (unknown reference, no payment row): a retry can never
//     help, so answer 2xx and stop the provider retrying;
//   - anything else is transient (database down, provider lookup failed):
//     the delivery is released from the replay guard - otherwise its retry
//     would be rejected as a "replay" - and a 500 asks the provider to
//     redeliver.
const answerProcessingFailure = async (req, res, error, provider) => {
    if (error && error.permanent) {
        logger.warn({ err: error, provider, reqId: req.id }, "webhook could not be matched to a payment - not retryable");
        return res.status(200).json({ success: false });
    }

    logger.error({ err: error, provider, reqId: req.id }, "webhook processing failed - asking the provider to retry");
    Sentry.captureException(error, { tags: { area: "payment-webhook", provider } });

    if (req.replayGuardKey) {
        await require("../../utils/webhookReplayGuard").forgetDelivery(req.replayGuardKey.provider, req.replayGuardKey.raw);
    }

    return res.status(500).json({ success: false });
};

exports.initiateWalletTopUp = async (req, res) => {
    try {
        const result = await paymentService.initiateWalletTopUp(req.user.id, req.body.phone, req.body.amount);
        return res.status(201).json({ success: true, message: result.message, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.initiateWalletOrderPayment = async (req, res) => {
    try {
        const result = await paymentService.initiateWalletOrderPayment(req.params.orderId, req.user.id);
        return res.status(200).json({ success: true, message: "Paid from wallet balance", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

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

// (Resilience & Growth). No orderId/auth-role restriction beyond
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
    const payload = req.body || {};

    // (Security) - the signature check upstream proves this request came
    // from MalipoPay at some point; it doesn't prove `reference` is a
    // well-formed reference we issued. A malformed or missing one is a
    // clean "ignored", not an application error.
    if (typeof payload.reference !== "string" || !payload.reference) {
        logger.warn({ provider: "malipopay", reqId: req.id }, "[webhook] malipopay payload missing/invalid reference field");
        return res.status(200).json({ success: false });
    }

    // PENDING / PROCESSING (and any status we do not recognise) mean "not
    // finished" - acknowledge and ignore, never mark the payment failed.
    const outcome = providerStatus.classifyMalipopay(payload);
    if (outcome === "pending") {
        return res.status(200).json({ success: true, ignored: true });
    }

    try {
        await paymentService.handleProviderWebhook({
            providerReference: payload.reference,
            success: outcome === "success",
            transactionReference: payload.transactionReference || payload.reference,
            reportedAmount: payload.amount,
            reportedCurrency: payload.currency
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, "malipopay");
    }
};

// Selcom's equivalent - give them:
//   https://<your-domain>/api/v1/payments/webhooks/selcom
// Signature verification (Bearer token auth, per
// developers.selcommobile.com's C2B Payment Notification API) happens
// upstream in verifySelcomWebhook - see docs/WEBHOOK_VALIDATION.md §1/§6.
exports.selcomWebhook = async (req, res) => {
    const payload = req.body || {};

    // Same reasoning as malipopayWebhook above - upstream auth proves
    // provenance, not shape.
    if (typeof payload.transid !== "string" || !payload.transid) {
        logger.warn({ provider: "selcom", reqId: req.id }, "[webhook] selcom payload missing/invalid transid field");
        return res.status(200).json({ success: false });
    }

    const outcome = providerStatus.classifySelcom(payload);
    if (outcome === "pending") {
        return res.status(200).json({ success: true, ignored: true });
    }

    try {
        await paymentService.handleProviderWebhook({
            providerReference: payload.transid,
            success: outcome === "success",
            transactionReference: payload.reference || payload.transid,
            // Selcom's notification may carry the amount; when it does it
            // is checked against what we expected.
            reportedAmount: payload.amount
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, "selcom");
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

// Snippe calls this URL directly (server-to-server), signed with
// SNIPPE_WEBHOOK_SECRET. Give Snippe this exact path in their dashboard:
//   https://<your-domain>/api/v1/payments/webhooks/snippe
//
// IMPORTANT: this route must receive the RAW request body (not JSON-
// parsed) for signature verification to work - see the express.raw()
// wiring in payment.routes.js.
exports.snippeWebhook = async (req, res) => {
    return handleHostedCheckoutWebhook(req, res, {
        provider: "snippe",
        constructEvent: () => require("./providers/snippe.provider").constructWebhookEvent(req.body, req.headers["snippe-signature"]),
        handle: (event) => paymentService.handleSnippeWebhookEvent(event)
    });
};

// Shared by the two hosted-checkout card rails. HMAC verification proves a
// delivery came from the provider; the replay guard proves it is the first
// time these exact bytes were seen. The delivery is recorded BEFORE
// processing (so two concurrent deliveries cannot both run) and released
// again if processing fails transiently (so the provider's retry is not
// mistaken for a replay).
async function handleHostedCheckoutWebhook(req, res, { provider, constructEvent, handle }) {
    const replayGuard = require("../../utils/webhookReplayGuard");
    let event;

    try {
        event = constructEvent();
    } catch (error) {
        // An invalid signature means this request didn't come from the
        // provider - a 4xx is what we want (it won't retry a request that
        // can never become valid). Warning level, not an exception: this
        // is usually a forgery or a misconfigured secret, not a bug.
        logger.error({ err: error, provider, reqId: req.id }, `${provider} webhook rejected`);
        Sentry.captureMessage(`${provider} webhook rejected`, {
            level: "warning",
            tags: { area: "payment-webhook", provider },
            extra: { reason: error.message }
        });
        return res.status(400).json({ success: false });
    }

    if (!replayGuard.isTimestampFresh(event.created)) {
        logger.warn({ provider, reqId: req.id }, `${provider} webhook rejected: stale/future event timestamp (possible replay)`);
        Sentry.captureMessage(`${provider} webhook rejected`, {
            level: "warning",
            tags: { area: "payment-webhook", provider },
            extra: { reason: "stale timestamp" }
        });
        return res.status(400).json({ success: false });
    }

    try {
        const isFreshDelivery = await replayGuard.recordDelivery(provider, req.body);
        if (!isFreshDelivery) {
            return res.status(400).json({ success: false });
        }
    } catch (error) {
        // The guard table itself is unavailable - transient.
        logger.error({ err: error, provider, reqId: req.id }, "replay guard unavailable");
        return res.status(500).json({ success: false });
    }

    req.replayGuardKey = { provider, raw: req.body };

    try {
        await handle(event);
        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, provider);
    }
}

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

// MalipoPay calls this URL directly (server-to-server), signed with
// MALIPOPAY_CARD_WEBHOOK_SECRET. Give MalipoPay this exact path in their
// dashboard's card-product webhook setting:
//   https://<your-domain>/api/v1/payments/webhooks/malipopay-card
//
// IMPORTANT: this route must receive the RAW request body (not JSON-
// parsed) for signature verification to work - see the express.raw()
// wiring in app.js, mirroring the Snippe webhook exactly.
exports.malipopayCardWebhook = async (req, res) => {
    // Real header name confirmed via MalipoPay's official malipopay-php
    // SDK (X-Malipopay-Signature); Express lower-cases header names.
    return handleHostedCheckoutWebhook(req, res, {
        provider: "malipopay-card",
        constructEvent: () => require("./providers/malipopayCard.provider").constructWebhookEvent(req.body, req.headers["x-malipopay-signature"]),
        handle: (event) => paymentService.handleMalipopayCardWebhookEvent(event)
    });
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

// Called by OUR OWN frontend after the buyer/seller is redirected back
// from PayPal's approval page - this is what actually captures the
// funds server-side. Never trust the redirect itself as proof of
// payment; PayPal's capture response is the only thing that matters.
exports.capturePaypalPayment = async (req, res) => {
    try {
        const result = await paymentService.capturePaypalPayment(req.body.paypalOrderId, req.user.id);

        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// PayPal calls this URL directly. The route receives the RAW body (see
// app.js) and every delivery is verified with PayPal's own
// verify-webhook-signature endpoint (needs PAYPAL_WEBHOOK_ID) before
// anything is read from it - fail closed when it cannot be verified.
//   https://<your-domain>/api/v1/payments/webhooks/paypal
exports.paypalWebhook = async (req, res) => {
    const paypalProvider = require("./providers/paypal.provider");
    const replayGuard = require("../../utils/webhookReplayGuard");

    let event;
    try {
        event = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {}));
    } catch (error) {
        return res.status(400).json({ success: false });
    }

    const verified = await paypalProvider.verifyWebhookSignature(req.headers, event);
    if (!verified) {
        logger.warn({ provider: "paypal", reqId: req.id, ip: req.ip }, "PayPal webhook rejected: signature not verified");
        Sentry.captureMessage("PayPal webhook rejected", { level: "warning", tags: { area: "payment-webhook", provider: "paypal" } });
        return res.status(400).json({ success: false });
    }

    try {
        const isFreshDelivery = await replayGuard.recordDelivery("paypal", event.id || req.body);
        if (!isFreshDelivery) {
            return res.status(200).json({ success: true, duplicate: true });
        }
    } catch (error) {
        logger.error({ err: error, provider: "paypal", reqId: req.id }, "replay guard unavailable");
        return res.status(500).json({ success: false });
    }

    req.replayGuardKey = { provider: "paypal", raw: event.id || req.body };

    try {
        await paymentService.handlePaypalWebhookEvent(event);
        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, "paypal");
    }
};

// --- Admin: payments needing review ------------------------------------------

exports.listPaymentReviews = async (req, res) => {
    try {
        const data = await paymentService.listReviewQueue(req.query);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.resolvePaymentReview = async (req, res) => {
    try {
        const data = await paymentService.resolveReviewItem(Number(req.params.reviewId), req.user.id, req.body?.note);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.acceptPaymentReview = async (req, res) => {
    try {
        const data = await paymentService.acceptReviewedPayment(Number(req.params.reviewId), req.user.id, req.body?.note);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Booking payments Financial Integration) ---------------------

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