const express = require("express");
const router = express.Router();

const { register, login, verifyLoginOtp, resendLoginOtp } = require("./auth.controller");
const { registerValidation } = require("./auth.validator");


router.post("/register", registerValidation, register);

router.post("/login", login);
router.post("/login/verify-otp", verifyLoginOtp);
router.post("/login/resend-otp", resendLoginOtp);

module.exports = router;
