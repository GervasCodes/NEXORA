const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const accountController = require("./account.controller");
const upload = require("../../middleware/upload.middleware");
const { authLimiter } = require("../../middleware/rateLimit.middleware");
const {
    updateProfileValidation,
    updateSettingsValidation,
    verifyPasswordChangeOtpValidation,
    changePasswordValidation,
    deleteAccountValidation
} = require("./account.validator");

router.use(authMiddleware);

router.get("/", accountController.getProfile);
router.put("/profile", updateProfileValidation, validationMiddleware, accountController.updateProfile);
router.put("/settings", updateSettingsValidation, validationMiddleware, accountController.updateSettings);

// Phase 4 (Real Imagery & Avatars): one shared endpoint for every
// account type (buyer, seller, delivery agent) - router.use(authMiddleware)
// above is all the auth this needs, same as seller's upload-logo/-banner.
// Goes through the same upload + file-content-validation middleware as
// product images/seller logos (Global Rule #3) rather than a new path.
router.post("/photo", upload.single("photo"), accountController.uploadProfilePhoto);

// OTP-gated password change: request a code, verify it (get a short-lived
// reauth token), then use that token to actually set the new password.
router.post("/password/request-otp", authLimiter, accountController.requestPasswordChangeOtp);
router.post("/password/verify-otp", authLimiter, verifyPasswordChangeOtpValidation, validationMiddleware, accountController.verifyPasswordChangeOtp);
router.put("/password", changePasswordValidation, validationMiddleware, accountController.changePassword);
router.delete("/", deleteAccountValidation, validationMiddleware, accountController.deleteAccount);

module.exports = router;
