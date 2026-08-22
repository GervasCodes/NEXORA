const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const groupBuyController = require("./groupBuy.controller");
const { createValidation, idValidation, claimValidation } = require("./groupBuy.validator");

// --- Public ---
router.get("/", groupBuyController.listOpen);

// --- Seller --- (mounted before "/:id" for the same reason every other
// module in this codebase mounts its list/mine routes first)
router.get("/seller/mine", authMiddleware, authorize("seller"), groupBuyController.listMine);
router.post("/seller", authMiddleware, authorize("seller"), createValidation, validationMiddleware, groupBuyController.create);

// --- Buyer ---
router.get("/buyer/mine", authMiddleware, authorize("buyer"), groupBuyController.listMyParticipations);
router.post("/:id/join", authMiddleware, authorize("buyer"), idValidation, validationMiddleware, groupBuyController.join);
router.post("/:id/claim", authMiddleware, authorize("buyer"), claimValidation, validationMiddleware, groupBuyController.claim);

// --- Shared ---
router.get("/:id", idValidation, validationMiddleware, groupBuyController.getById);

module.exports = router;
