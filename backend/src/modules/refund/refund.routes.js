const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const refundController = require("./refund.controller");

router.use(authMiddleware, authorize("admin"));

router.get("/", refundController.list);
router.get("/needs-attention-count", refundController.needsAttentionCount);
router.get("/:id", refundController.getOne);
router.post("/:id/retry", refundController.retry);

module.exports = router;
