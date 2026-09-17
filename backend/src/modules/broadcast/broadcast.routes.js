const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const broadcastController = require("./broadcast.controller");
const { previewValidation, sendBroadcastValidation } = require("./broadcast.validator");

router.use(authMiddleware, authorize("admin"));

router.get("/", broadcastController.getHistory);
router.post("/preview", previewValidation, validationMiddleware, broadcastController.preview);
router.post("/", sendBroadcastValidation, validationMiddleware, broadcastController.send);

module.exports = router;
