const express = require("express");
const { param } = require("express-validator");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const controller = require("./documentAccess.controller");

router.use(authMiddleware, authorize("admin"));

router.get(
    "/:kind/:id/url",
    [
        param("kind").isIn(["verification", "kyc"]).withMessage("Unknown document type"),
        param("id").isInt({ gt: 0 }).withMessage("Invalid document")
    ],
    validationMiddleware,
    controller.getUrl
);

module.exports = router;
