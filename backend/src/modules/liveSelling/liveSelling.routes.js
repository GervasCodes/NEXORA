const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const liveSellingController = require("./liveSelling.controller");
const { createValidation, setStatusValidation, sessionIdValidation } = require("./liveSelling.validator");

router.get("/", liveSellingController.listUpcoming);

// Reminders (Phase 9, UI/UX remediation) - buyer-facing, so these need
// their own auth gate rather than the authorize("seller") one below,
// which would otherwise wrongly restrict "notify me" to sellers.
router.get("/:id/remind", authMiddleware, authorize("buyer"), sessionIdValidation, validationMiddleware, liveSellingController.getReminderStatus);
router.post("/:id/remind", authMiddleware, authorize("buyer"), sessionIdValidation, validationMiddleware, liveSellingController.subscribeReminder);
router.delete("/:id/remind", authMiddleware, authorize("buyer"), sessionIdValidation, validationMiddleware, liveSellingController.unsubscribeReminder);

router.use(authMiddleware, authorize("seller"));
router.get("/mine", liveSellingController.listMine);
router.post("/", createValidation, validationMiddleware, liveSellingController.create);
router.put("/:id/status", setStatusValidation, validationMiddleware, liveSellingController.setStatus);

module.exports = router;
