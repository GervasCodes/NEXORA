const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const pushController = require("./push.controller");
const { subscribeValidation, unsubscribeValidation } = require("./push.validator");

// Public: frontend needs this before the user is necessarily logged in
// (service worker registration can happen early).
router.get("/vapid-public-key", pushController.getPublicKey);

router.post(
    "/subscribe",
    authMiddleware,
    subscribeValidation,
    validationMiddleware,
    pushController.subscribe
);

router.post(
    "/unsubscribe",
    authMiddleware,
    unsubscribeValidation,
    validationMiddleware,
    pushController.unsubscribe
);

module.exports = router;
