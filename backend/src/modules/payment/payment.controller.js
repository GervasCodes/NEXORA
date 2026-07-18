const paymentService = require("./payment.service");

// Buyers/sellers pass their own return URLs (e.g. the exact order or
// verification page they were on) so Snippe/PayPal send them back to the
// right place - but an unchecked client-supplied redirect URL is an
// open-redirect risk, so only allow one whose origin matches a configured
// CORS_ORIGIN.
const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const assertAllowedRedirect = (url, label) => {
    if (!url) {
        throw new Error(`${label} is required`);
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`${label} is not a valid URL`);
    }
    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
        throw new Error(`${label} is not an allowed redirect destination`);
    }
    return url;
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
// NOTE: confirm MalipoPay's real payload field names + any signature
// header against their dashboard docs once you're onboarded - the shape
// below follows their commonly documented pattern, but verify before
// relying on it in production. If they give you a signing secret, verify
// it here before trusting the payload.
exports.malipopayWebhook = async (req, res) => {
    try {
        const payload = req.body;

        await paymentService.handleProviderWebhook({
            providerReference: payload.reference,
            success: payload.status === "SUCCESS" || payload.status === "success",
            transactionReference: payload.transactionReference || payload.reference
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("MalipoPay webhook error:", error);
        // Still 200 so MalipoPay doesn't retry-storm on our own bug; the
        // error is logged above for us to investigate.
        return res.status(200).json({ success: false });
    }
};

// Selcom's equivalent - give them:
//   https://<your-domain>/api/v1/payments/webhooks/selcom
// Confirm their real callback payload shape with Selcom directly.
exports.selcomWebhook = async (req, res) => {
    try {
        const payload = req.body;

        await paymentService.handleProviderWebhook({
            providerReference: payload.transid,
            success: payload.resultcode === "000" || payload.result === "SUCCESS",
            transactionReference: payload.reference || payload.transid
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Selcom webhook error:", error);
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
        const event = snippeProvider.constructWebhookEvent(req.body, req.headers["snippe-signature"]);

        await paymentService.handleSnippeWebhookEvent(event);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Snippe webhook error:", error.message);
        // 400 here (unlike the mobile money webhooks) is correct: an
        // invalid signature means this request didn't come from Snippe,
        // and a 4xx on a signature failure is what we want (it won't
        // retry a request that will never become valid).
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

exports.confirmCashOnDelivery = async (req, res) => {
    try {
        const result = await paymentService.confirmCashOnDelivery(
            req.params.orderId,
            req.user.id
        );

        return res.json({
            success: true,
            message: "Cash on Delivery payment confirmed",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};