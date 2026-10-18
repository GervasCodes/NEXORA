const express = require("express");
const router = express.Router();

const { register, usernameAvailable, googleSignIn, googleComplete, login, verifyLoginOtp, resendLoginOtp, forgotPassword, resetPassword, logout, me, csrfRefresh } = require("./auth.controller");
const { registerValidation, googleSignInValidation, googleCompleteValidation } = require("./auth.validator");
const { authLimiter, usernameCheckLimiter } = require("../../middleware/rateLimit.middleware");
const authMiddleware = require("../../middleware/auth.middleware");
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

// Phase 6 (round 5): public availability check for the register form.
router.get("/username-available", usernameCheckLimiter, usernameAvailable);

// Phase 7 (round 5): Google sign-in / sign-up. No session exists yet, so these
// are CSRF-exempt like /login (see csrf.middleware.js).
router.post("/google", authLimiter, googleSignInValidation, googleSignIn);
router.post("/google/complete", authLimiter, googleCompleteValidation, googleComplete);

router.post("/login", authLimiter, login);
router.post("/login/verify-otp", authLimiter, verifyLoginOtp);
router.post("/login/resend-otp", authLimiter, resendLoginOtp);

router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

// Phase 4 (Testing & Session Hardening)
router.post("/logout", logout);
router.get("/me", authMiddleware, me);
router.get("/csrf", authMiddleware, csrfRefresh);

module.exports = router;
