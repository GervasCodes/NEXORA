const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const accountController = require("./account.controller");
const {
    updateProfileValidation,
    updateSettingsValidation,
    changePasswordValidation,
    deleteAccountValidation
} = require("./account.validator");

router.use(authMiddleware);

router.get("/", accountController.getProfile);
router.put("/profile", updateProfileValidation, validationMiddleware, accountController.updateProfile);
router.put("/settings", updateSettingsValidation, validationMiddleware, accountController.updateSettings);
router.put("/password", changePasswordValidation, validationMiddleware, accountController.changePassword);
router.delete("/", deleteAccountValidation, validationMiddleware, accountController.deleteAccount);

module.exports = router;
