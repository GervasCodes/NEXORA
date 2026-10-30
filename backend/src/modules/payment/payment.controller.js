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
            data: methods,
            maintenance: require("../../middleware/paymentsMaintenance.middleware").statusFor(req.user)
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

// Selcom calls this URL directly (server-to-server) when a payment - mobile
// money push or hosted card checkout - completes, fails or is cancelled. Give
// Selcom:
//   https://<your-domain>/api/v1/payments/webhooks/selcom
// Authentication (static Bearer token, per developers.selcommobile.com's
// Payment Notification API) happens upstream in verifySelcomWebhook - see
// docs/WEBHOOK_VALIDATION.md.
exports.selcomWebhook = async (req, res) => {
    const payload = req.body || {};

    // The order id we sent is our payment reference; Selcom echoes it as
    // order_id (checkout) and/or transid. Upstream auth proves provenance,
    // not shape, so a missing/odd reference is a clean "ignored".
    const reference = [payload.order_id, payload.transid].find((value) => typeof value === "string" && value);

    if (!reference) {
        logger.warn({ provider: "selcom", reqId: req.id }, "[webhook] selcom payload missing order_id/transid");
        return res.status(200).json({ success: false });
    }

    const outcome = providerStatus.classifySelcom(payload);
    if (outcome === "pending") {
        return res.status(200).json({ success: true, ignored: true });
    }

    try {
        await paymentService.handleProviderWebhook({
            providerReference: reference,
            success: outcome === "success",
            transactionReference: payload.reference || reference,
            // When Selcom reports the amount it is checked against what we expected.
            reportedAmount: payload.amount
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, "selcom");
    }
};

// AzamPay's callback URL (register it in the AzamPay dashboard, with the
// shared secret - see verifyAzampayWebhook):
//   https://<your-domain>/api/v1/payments/webhooks/azampay?secret=<AZAMPAY_WEBHOOK_SECRET>
// The externalId we sent comes back as `utilityref`.
exports.azampayWebhook = async (req, res) => {
    const payload = req.body || {};

    const reference = [payload.utilityref, payload.externalId].find((value) => typeof value === "string" && value);

    if (!reference) {
        logger.warn({ provider: "azampay", reqId: req.id }, "[webhook] azampay payload missing utilityref");
        return res.status(200).json({ success: false });
    }

    const outcome = providerStatus.classifyAzampay(payload);
    if (outcome === "pending") {
        return res.status(200).json({ success: true, ignored: true });
    }

    try {
        await paymentService.handleProviderWebhook({
            providerReference: reference,
            success: outcome === "success",
            transactionReference: payload.reference || payload.transactionId || reference,
            reportedAmount: payload.amount
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, "azampay");
    }
};

// PawaPay calls this URL for deposit (and payout / refund) results. Set it as
// the deposit callback URL in the PawaPay dashboard:
//   https://<your-domain>/api/v1/payments/webhooks/pawapay
//
// IMPORTANT: needs the RAW request body (the signature covers its digest) -
// registered in app.js with express.raw(), like the PayPal webhook.
//
// Authenticity: signed callbacks (RFC 9421) are verified against PawaPay's
// published public keys. An unsigned callback is only accepted when
// PAWAPAY_ALLOW_UNSIGNED_CALLBACKS=true, and is then never trusted on its own:
// the deposit's status is re-read from PawaPay's API before anything is applied.
exports.pawapayWebhook = async (req, res) => {
    const pawapay = require("./providers/pawapay.provider");
    const replayGuard = require("../../utils/webhookReplayGuard");

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    let payload;
    try {
        payload = JSON.parse(rawBody.toString("utf8"));
    } catch (error) {
        return res.status(400).json({ success: false });
    }

    const signed = Boolean(req.headers.signature);

    if (signed) {
        const verified = await pawapay.verifyCallbackSignature({
            rawBody,
            headers: req.headers,
            method: req.method,
            authority: process.env.PAWAPAY_CALLBACK_AUTHORITY || req.headers["x-forwarded-host"] || req.headers.host,
            path: req.originalUrl.split("?")[0]
        }).catch(() => false);

        if (!verified) {
            logger.warn({ provider: "pawapay", reqId: req.id, ip: req.ip }, "PawaPay webhook rejected: signature not verified");
            Sentry.captureMessage("PawaPay webhook rejected", { level: "warning", tags: { area: "payment-webhook", provider: "pawapay" } });
            return res.status(400).json({ success: false });
        }
    } else if (!pawapay.allowUnsignedCallbacks()) {
        logger.warn({ provider: "pawapay", reqId: req.id, ip: req.ip }, "PawaPay webhook rejected: unsigned (enable signed callbacks in the PawaPay dashboard)");
        return res.status(400).json({ success: false });
    }

    // Payout / refund results come to the same URL (a refund callback can also
    // carry the original depositId, hence the refundId/payoutId checks); nothing
    // here waits on them.
    if (!payload.depositId || payload.refundId || payload.payoutId) {
        logger.info({ provider: "pawapay", reqId: req.id, status: payload.status }, "pawapay non-deposit callback acknowledged");
        return res.status(200).json({ success: true, ignored: true });
    }

    let deposit = payload;

    if (!signed) {
        try {
            const lookup = await pawapay.getDeposit(payload.depositId);
            if (!lookup.found) return res.status(200).json({ success: true, ignored: true });
            deposit = lookup.deposit;
        } catch (error) {
            return answerProcessingFailure(req, res, error, "pawapay");
        }
    }

    const outcome = providerStatus.classifyPawapay(deposit);
    if (outcome === "pending") {
        return res.status(200).json({ success: true, ignored: true });
    }

    try {
        const isFreshDelivery = await replayGuard.recordDelivery("pawapay", rawBody);
        if (!isFreshDelivery) {
            return res.status(200).json({ success: true, duplicate: true });
        }
    } catch (error) {
        logger.error({ err: error, provider: "pawapay", reqId: req.id }, "replay guard unavailable");
        return res.status(500).json({ success: false });
    }

    req.replayGuardKey = { provider: "pawapay", raw: rawBody };

    try {
        await paymentService.handlePawapayDepositEvent({
            depositId: payload.depositId,
            success: outcome === "success",
            reportedAmount: deposit.amount,
            reportedCurrency: deposit.currency,
            reference: Array.isArray(deposit.metadata)
                ? (deposit.metadata.find((item) => item && item.reference) || {}).reference
                : deposit.metadata && deposit.metadata.reference
        });
        return res.status(200).json({ success: true });
    } catch (error) {
        return answerProcessingFailure(req, res, error, "pawapay");
    }
};

// --- Card (hosted checkout) ----------------------------------------------
// One card rail for every gateway: CARD_PROVIDER decides who takes the card.

exports.initiateCardOrderPayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiateCardOrderPayment(
            req.params.orderId,
            req.user.id,
            { successUrl, cancelUrl }
        );

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
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

exports.initiateCardBookingPayment = async (req, res) => {
    try {
        const successUrl = assertAllowedRedirect(req.body.successUrl, "successUrl");
        const cancelUrl = assertAllowedRedirect(req.body.cancelUrl, "cancelUrl");

        const result = await paymentService.initiateCardBookingPayment(
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