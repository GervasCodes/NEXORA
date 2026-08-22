const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const liveSellingController = require("./liveSelling.controller");
const { createValidation, setStatusValidation } = require("./liveSelling.validator");

router.get("/", liveSellingController.listUpcoming);

router.use(authMiddleware, authorize("seller"));
router.get("/mine", liveSellingController.listMine);
router.post("/", createValidation, validationMiddleware, liveSellingController.create);
router.put("/:id/status", setStatusValidation, validationMiddleware, liveSellingController.setStatus);

module.exports = router;
