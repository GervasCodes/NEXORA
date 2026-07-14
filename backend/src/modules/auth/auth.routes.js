const express = require("express");
const router = express.Router();

const { register, login, verifyLoginOtp, resendLoginOtp, forgotPassword, resetPassword } = require("./auth.controller");
const { registerValidation } = require("./auth.validator");
const { authLimiter } = require("../../middleware/rateLimit.middleware");


router.post("/register", authLimiter, registerValidation, register);

router.post("/login", authLimiter, login);
router.post("/login/verify-otp", authLimiter, verifyLoginOtp);
router.post("/login/resend-otp", authLimiter, resendLoginOtp);

router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

module.exports = router;
