const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const paymentController = require("./payment.controller");
const { orderIdValidation } = require("./payment.validator");
const { verifyMalipopayWebhook, verifySelcomWebhook } = require("../../middleware/webhookAuth.middleware");

// Provider webhooks - called directly by MalipoPay/Selcom's servers, not
// by anyone logged into NEXORA. No authMiddleware (that's for logged-in
// users), but verifyMalipopayWebhook/verifySelcomWebhook check a shared
// secret header so this can't be forged by a random POST request - see
// webhookAuth.middleware.js for why that mattered.
//
// NOTE: the Snippe webhook (POST /webhooks/snippe) is NOT defined here -
// it's registered directly in app.js, before the global JSON body
// parser, because Snippe's signature verification needs the raw request
// body. See the comment in app.js for why.
router.post("/webhooks/malipopay", verifyMalipopayWebhook, paymentController.malipopayWebhook);
router.post("/webhooks/selcom", verifySelcomWebhook, paymentController.selcomWebhook);

// IMPORTANT: every literal-path route below (verification-fee/*,
// paypal/capture) MUST stay registered before the "/:orderId/..." routes
// further down. Express matches routes in registration order, and
// "/:orderId/snippe/checkout" has the same segment count/shape as
// "/verification-fee/snippe/checkout" - if the dynamic route were
// registered first, a request for the literal path would match it
// instead, with orderId wrongly bound to the string "verification-fee"
// (caught live during this audit: it 403'd with "Access denied" because
// that route also requires the buyer role, not seller).

// Verification fee (seller-only) - Snippe/PayPal alternatives to the
// existing mobile-money verification fee flow in seller.routes.js
// (POST /seller/verification/fee). Kept in the payment module since
// they're genuinely payment-gateway concerns, not seller-profile ones.
router.post(
    "/verification-fee/snippe/checkout",
    authMiddleware,
    authorize("seller"),
    paymentController.initiateSnippeVerificationFeePayment
);

router.post(
    "/verification-fee/paypal/create",
    authMiddleware,
    authorize("seller"),
    paymentController.initiatePaypalVerificationFeePayment
);

// Called by our OWN frontend after a buyer/seller approves on PayPal's
// site and is redirected back - this is what actually captures the
// funds. Works for both an order payment and the verification fee
// (capturePaypalPayment figures out which from the stored payment row).
router.post(
    "/paypal/capture",
    authMiddleware,
    paymentController.capturePaypalPayment
);

router.post(
    "/:orderId/initiate",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateMobileMoneyPayment
);

router.post(
    "/:orderId/snippe/checkout",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateSnippeOrderPayment
);

router.post(
    "/:orderId/paypal/create",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiatePaypalOrderPayment
);

router.get(
    "/:orderId",
    authMiddleware,
    orderIdValidation,
    validationMiddleware,
    paymentController.getPayment
);

router.put(
    "/:orderId/confirm-cod",
    authMiddleware,
    authorize("seller"),
    orderIdValidation,
    validationMiddleware,
    paymentController.confirmCashOnDelivery
);

module.exports = router;