const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const buyerAddressController = require("./buyerAddress.controller");
const { addressValidation, addressIdValidation } = require("./buyerAddress.validator");

router.use(authMiddleware, authorize("buyer"));

router.get("/", buyerAddressController.list);
router.post("/", addressValidation, validationMiddleware, buyerAddressController.create);
router.put("/:id", addressIdValidation, addressValidation, validationMiddleware, buyerAddressController.update);
router.delete("/:id", addressIdValidation, validationMiddleware, buyerAddressController.remove);
router.put("/:id/default", addressIdValidation, validationMiddleware, buyerAddressController.setDefault);

module.exports = router;
