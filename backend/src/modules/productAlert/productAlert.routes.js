const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const productAlertController = require("./productAlert.controller");
const { productIdValidation, subscribeValidation, unsubscribeValidation } = require("./productAlert.validator");

router.get(
    "/products/:productId/alerts",
    authMiddleware,
    authorize("buyer"),
    productIdValidation,
    validationMiddleware,
    productAlertController.getSubscriptions
);
router.post(
    "/products/:productId/alerts",
    authMiddleware,
    authorize("buyer"),
    productIdValidation,
    subscribeValidation,
    validationMiddleware,
    productAlertController.subscribe
);
router.delete(
    "/products/:productId/alerts/:type",
    authMiddleware,
    authorize("buyer"),
    unsubscribeValidation,
    validationMiddleware,
    productAlertController.unsubscribe
);

module.exports = router;
