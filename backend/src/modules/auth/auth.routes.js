const express = require("express");
const router = express.Router();

const { register, login, verifyLoginOtp, resendLoginOtp } = require("./auth.controller");
const { registerValidation } = require("./auth.validator");
const { authLimiter } = require("../../middleware/rateLimit.middleware");


router.post("/register", authLimiter, registerValidation, register);

router.post("/login", authLimiter, login);
router.post("/login/verify-otp", authLimiter, verifyLoginOtp);
router.post("/login/resend-otp", authLimiter, resendLoginOtp);

module.exports = router;
