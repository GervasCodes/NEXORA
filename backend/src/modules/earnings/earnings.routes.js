const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");

const earningsController = require("./earnings.controller");

router.get(
    "/me",
    authMiddleware,
    authorize("delivery_agent"),
    earningsController.getMyDashboard
);

module.exports = router;
