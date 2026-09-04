const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const sellerSavedFilterController = require("./sellerSavedFilter.controller");
const { pageKeyValidation, createValidation, idValidation } = require("./sellerSavedFilter.validator");

router.use(authMiddleware, authorize("seller"));

router.get("/:pageKey", pageKeyValidation, validationMiddleware, sellerSavedFilterController.list);
router.post("/:pageKey", createValidation, validationMiddleware, sellerSavedFilterController.create);
router.delete("/:id", idValidation, validationMiddleware, sellerSavedFilterController.remove);

module.exports = router;
