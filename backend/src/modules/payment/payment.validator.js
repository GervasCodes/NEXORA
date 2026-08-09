const { param } = require("express-validator");
const phoneValidator = require("../../validators/sharedPhoneValidator");

exports.orderIdValidation = [
    param("orderId").isInt({ gt: 0 }).withMessage("Invalid order")
];

exports.bookingIdValidation = [
    param("bookingId").isInt({ gt: 0 }).withMessage("Invalid booking")
];

// Order mobile-money initiate doesn't take its own phone param - it
// reuses the order's shipping_phone (already normalized by
// order.validator.js at checkout). Booking mobile-money initiate does
// take its own phone in the request body (see
// payment.controller.js#initiateMobileMoneyBookingPayment) - this was
// previously completely unvalidated at the route layer before hitting
// the mobile money provider.
exports.bookingMobileMoneyPhoneValidation = [
    phoneValidator("phone")
];
