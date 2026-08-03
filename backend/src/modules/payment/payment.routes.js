const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const paymentController = require("./payment.controller");
const { orderIdValidation, bookingIdValidation } = require("./payment.validator");
const { verifyMalipopayWebhook, verifySelcomWebhook } = require("../../middleware/webhookAuth.middleware");

// Provider webhooks - called directly by MalipoPay/Selcom's servers, not
// by anyone logged into NEXORA. No authMiddleware (that's for logged-in
// users), but verifyMalipopayWebhook/verifySelcomWebhook check a shared
// secret header so this can't be forged by a random POST request - see
// webhookAuth.middleware.js for why that mattered.
//
// NOTE: the Snippe webhook (POST /webhooks/snippe) and the MalipoPay
// Card webhook (POST /webhooks/malipopay-card) are NOT defined here -
// they're registered directly in app.js, before the global JSON body
// parser, because their signature verification needs the raw request
// body. See the comment in app.js for why.
//
// "/webhooks/malipopay" below is the MOBILE MONEY MalipoPay rail's
// webhook (shared-secret header, not HMAC-over-body) - a completely
// separate integration/credentials from the MalipoPay Card webhook. Do
// not merge these two; see malipopayCard.provider.js's header comment.
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
    "/verification-fee/malipopay-card/checkout",
    authMiddleware,
    authorize("seller"),
    paymentController.initiateMalipopayCardVerificationFeePayment
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

// Booking payments (Phase 3 - Financial Integration) - buyer-side, mirror
// the order-payment routes below one-for-one but under a literal
// "/booking/" prefix so they can't collide with "/:orderId/..." further
// down (same reasoning the verification-fee/paypal routes above already
// document - literal paths must be registered before same-shaped dynamic
// ones).
router.post(
    "/booking/:bookingId/initiate",
    authMiddleware,
    authorize("buyer"),
    bookingIdValidation,
    validationMiddleware,
    paymentController.initiateMobileMoneyBookingPayment
);

router.post(
    "/booking/:bookingId/snippe/checkout",
    authMiddleware,
    authorize("buyer"),
    bookingIdValidation,
    validationMiddleware,
    paymentController.initiateSnippeBookingPayment
);

router.post(
    "/booking/:bookingId/malipopay-card/checkout",
    authMiddleware,
    authorize("buyer"),
    bookingIdValidation,
    validationMiddleware,
    paymentController.initiateMalipopayCardBookingPayment
);

router.post(
    "/booking/:bookingId/paypal/create",
    authMiddleware,
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
    "/:orderId/malipopay-card/checkout",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiateMalipopayCardOrderPayment
);

router.post(
    "/:orderId/paypal/create",
    authMiddleware,
    authorize("buyer"),
    orderIdValidation,
    validationMiddleware,
    paymentController.initiatePaypalOrderPayment
);

// Phase 5 (Resilience & Growth). Literal path - MUST stay registered
// before "/:orderId" below for the same reason the verification-fee
// routes above do (Express would otherwise bind orderId to the string
// "methods").
router.get(
    "/methods",
    authMiddleware,
    paymentController.getAvailablePaymentMethods
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