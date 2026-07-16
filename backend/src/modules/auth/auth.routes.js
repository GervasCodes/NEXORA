const express = require("express");
const router = express.Router();

const { register, login, verifyLoginOtp, resendLoginOtp, forgotPassword, resetPassword } = require("./auth.controller");
const { registerValidation } = require("./auth.validator");
const { authLimiter } = require("../../middleware/rateLimit.middleware");
const uploadDocument = require("../../middleware/uploadDocument.middleware");

// uploadDocument.fields(...) only parses the request when its
// content-type is multipart/form-data (a seller/delivery_agent
// registration carrying verification documents); a plain JSON buyer
// registration passes straight through untouched. Runs before
// registerValidation so express-validator sees the parsed text fields
// either way.
router.post(
    "/register",
    authLimiter,
    uploadDocument.fields([
        { name: "owner_photo", maxCount: 1 },
        { name: "national_id", maxCount: 1 },
        { name: "voter_id", maxCount: 1 },
        { name: "drivers_license", maxCount: 1 }
    ]),
    registerValidation,
    register
);

router.post("/login", authLimiter, login);
router.post("/login/verify-otp", authLimiter, verifyLoginOtp);
router.post("/login/resend-otp", authLimiter, resendLoginOtp);

router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

module.exports = router;
