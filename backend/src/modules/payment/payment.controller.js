const paymentService = require("./payment.service");

exports.initiateMobileMoneyPayment = async (req, res) => {
    try {
        const result = await paymentService.initiateMobileMoneyPayment(
            req.params.orderId,
            req.user.id
        );

        return res.status(201).json({
            success: true,
            message: "Payment completed successfully",
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