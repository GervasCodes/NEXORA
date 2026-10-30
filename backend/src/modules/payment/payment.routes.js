const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const { blockWhenPaymentsInMaintenance } = require("../../middleware/paymentsMaintenance.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const paymentController = require("./payment.controller");
const { orderIdValidation, bookingIdValidation, bookingMobileMoneyPhoneValidation } = require("./payment.validator");
const { verifySelcomWebhook, verifyAzampayWebhook } = require("../../middleware/webhookAuth.middleware");

// Provider webhooks - called directly by Selcom's / AzamPay's servers, not by
// anyone logged into NEXORA. No authMiddleware (that's for logged-in users),
// but verifySelcomWebhook / verifyAzampayWebhook check a shared secret so this
// can't be forged by a random POST request - see webhookAuth.middleware.js.
//
// NOTE: the PawaPay webhook (POST /webhooks/pawapay) is NOT defined here -
// like PayPal's it is registered directly in app.js, before the global JSON
// body parser, because signature verification needs the raw request body.
router.post("/webhooks/selcom", verifySelcomWebhook, paymentController.selcomWebhook);
router.post("/webhooks/azampay", verifyAzampayWebhook, paymentController.azampayWebhook);

// NOTE: the PayPal webhook (POST /webhooks/paypal) is registered in app.js
// with the raw body parser, like the PawaPay webhook.

// Admin: payments that need a human decision (paid after cancel, amount
// mismatch, duplicate payment, chargeback, completed-at-provider-but-not-
// here). Literal paths - must stay registered before "/:orderId/...".
router.get("/review-queue", authMiddleware, authorize("admin"), paymentController.listPaymentReviews);
router.post("/review-queue/:reviewId/resolve", authMiddleware, authorize("admin"), paymentController.resolvePaymentReview);
router.post("/review-queue/:reviewId/accept", authMiddleware, authorize("admin"), paymentController.acceptPaymentReview);

// IMPORTANT: the "paypal/capture" literal-path route below MUST stay
// registered before the "/:orderId/..." routes further down. Express
// matches routes in registration order, and "/:orderId/card/checkout"
// has the same segment count/shape as a literal path like
// "/paypal/capture" - if a dynamic route were registered first, a
// request for the literal path would match it instead, with orderId
// wrongly bound to the literal segment (caught live during an earlier
// audit, when this same class of route also existed for the now-retired
// verification-fee flow).

// Called by our OWN frontend after a buyer/seller approves on PayPal's
// site and is redirected back - this is what actually captures the
// funds (capturePaypalPayment figures out what the payment was for from
// the stored payment row).
router.post(
    "/paypal/capture",
    authMiddleware,
    paymentController.capturePaypalPayment
);

// Booking payments (Financial Integration) - buyer-side, mirror
// the order-payment routes below one-for-one but under a literal
// "/booking/" prefix so they can't collide with "/:orderId/..." further
// down (same reasoning the verification-fee/paypal routes above already
// document - literal paths must be registered before same-shaped dynamic
// ones).
router.post(
    "/booking/:bookingId/initiate",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    bookingIdValidation,
    bookingMobileMoneyPhoneValidation,
    validationMiddleware,
    paymentController.initiateMobileMoneyBookingPayment
);

router.post(
    "/booking/:bookingId/card/checkout",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    bookingIdValidation,
    validationMiddleware,
    paymentController.initiateCardBookingPayment
);

router.post(
    "/booking/:bookingId/paypal/create",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    bookingIdValidation,
    validationMiddleware,
    paymentController.initiatePaypalBookingPayment
);

// Either party on the booking (mirrors GET /:orderId below) - the service
// layer checks customer_id/provider_id, not a role check at the route
// level.
router.get(
    "/booking/:bookingId",
    authMiddleware,
    bookingIdValidation,
    validationMiddleware,
    paymentController.getBookingPayment
);

router.post(
    "/:orderId/initiate",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateMobileMoneyPayment
);

router.post(
    "/:orderId/card/checkout",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateCardOrderPayment
);

router.post(
    "/:orderId/paypal/create",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiatePaypalOrderPayment
);

// (Resilience & Growth). Literal path - MUST stay registered
// before "/:orderId" below for the same reason the verification-fee
// routes above do (Express would otherwise bind orderId to the string
// "methods").
router.get(
    "/methods",
    authMiddleware,
    paymentController.getAvailablePaymentMethods
);

// Wallet top-up - literal path, same registration-order
// reasoning as "/methods" and "/verification-fee/*" above.
router.post(
    "/wallet/topup",
    authMiddleware,
    blockWhenPaymentsInMaintenance,
    authorize("buyer"),
    paymentController.initiateWalletTopUp
);

router.post(
    "/:orderId/wallet",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateWalletOrderPayment
);

router.get(
    "/:orderId",
    authMiddleware,
    orderIdValidation,
    validationMiddleware,
    paymentController.getPayment
);

// Buyer confirms they received the order (migration 061). For Cash on
// Delivery this is what finalizes the payment - replaces the old
// seller-self-reported PUT /:orderId/confirm-cod, which let a seller
// claim cash was collected with no buyer involvement at all.
router.put(
    "/:orderId/confirm-receipt",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.confirmDeliveryReceipt
);

module.exports = router;