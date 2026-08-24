const { validationResult } = require("express-validator");
const authService = require("./auth.service");
const { t } = require("../../i18n");
const loginService = require("./login.service");
const authRepository = require("./auth.repository");
const passwordResetService = require("./passwordReset.service");
const auditService = require("../audit/audit.service");
const adminNotificationService = require("../adminNotification/adminNotification.service");
const { sessionCookieOptions, csrfCookieOptions } = require("../../utils/sessionCookie");
const { generateCsrfToken } = require("../../middleware/csrf.middleware");

exports.register = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const result = await authService.register(req.body, req.files);

        auditService.logFromRequest(req, {
            userId: result.userId,
            eventType: "user_registered",
            description: `New ${req.body.role || "buyer"} account registered`,
            metadata: { role: req.body.role || "buyer" }
        });

        adminNotificationService.notify({
            type: "user_registered",
            category: "account",
            severity: "info",
            title: "New account registered",
            message: `A new ${req.body.role || "buyer"} account was registered (${req.body.email}).`,
            metadata: { role: req.body.role || "buyer", email: req.body.email },
            relatedUserId: result.userId
        });

        res.status(201).json({
            success: true,
            message: "User registered successfully.",
            data: result
        });

    } catch (error) {
        res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

// Step 1 of login: email + password. Never returns a session token -
// only a masked email + pre-auth token, once an OTP has been emailed.
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await loginService.login(email, password);

        res.json({
            success: true,
            message: "Enter the code we emailed you to finish signing in.",
            data: result
        });

    } catch (error) {
        auditService.logFromRequest(req, {
            eventType: "login_failed",
            description: `Failed login attempt for ${req.body.email || "unknown email"}`,
            metadata: { email: req.body.email, stage: "password" }
        });

        res.status(error.status || 401).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message,
            ...(error.code ? { code: error.code } : {}),
            ...(error.code === "ACCOUNT_SUSPENDED" ? { data: { reason: error.reason || null } } : {})
        });
    }
};

// Step 2 of login: OTP verification. Only here is a real session issued.
exports.verifyLoginOtp = async (req, res) => {
    try {
        const { pre_auth_token, code } = req.body;

        const result = await loginService.verifyLoginOtp(pre_auth_token, code);

        auditService.logFromRequest(req, {
            userId: result.user?.id,
            eventType: "login_success",
            description: "User signed in",
            metadata: { role: result.user?.role }
        });

        // Phase 4 (Testing & Session Hardening): the session token now
        // travels as an httpOnly cookie rather than in the response body
        // - keeping it out of reach of any JS running on the page (a
        // successful XSS can no longer just read it out of localStorage
        // and exfiltrate it). A second, deliberately readable cookie
        // carries a CSRF token the frontend must echo back on mutating
        // requests - see csrf.middleware.js.
        //
        // BUT: that cookie is set by this response, which in production
        // is a cross-origin request (frontend on nexoramarketplace.online,
        // this API on an onrender.com subdomain - see sessionCookie.js).
        // A cookie set via a cross-origin response is stored under THIS
        // origin, not the frontend's - document.cookie on the frontend's
        // own pages can never see it, regardless of httpOnly. So the
        // cookie still gets set (the browser auto-attaches it to future
        // requests to this API, which works fine cross-site with
        // SameSite=None), but the frontend now also gets the same value
        // here, in the response body, which IS same-origin-protected
        // (no more readable to a cross-site attacker than the cookie
        // approach was) and doesn't depend on cross-origin cookie storage
        // at all. See api/client.js's in-memory csrfToken.
        res.cookie("nexora_session", result.token, sessionCookieOptions());
        const csrfToken = generateCsrfToken();
        res.cookie("nexora_csrf", csrfToken, csrfCookieOptions());

        res.json({
            success: true,
            message: "Login successful",
            data: { user: result.user, csrfToken }
        });

    } catch (error) {
        auditService.logFromRequest(req, {
            eventType: "login_failed",
            description: "Failed login attempt (invalid or expired OTP)",
            metadata: { stage: "otp" }
        });

        res.status(error.status || 401).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.resendLoginOtp = async (req, res) => {
    try {
        await loginService.resendLoginOtp(req.body.pre_auth_token);

        res.json({
            success: true,
            message: "A new code has been sent."
        });

    } catch (error) {
        res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

// Always responds success regardless of whether the email exists -
// see passwordReset.service.js for why (prevents email enumeration).
exports.forgotPassword = async (req, res) => {
    try {
        await passwordResetService.requestPasswordReset(req.body.email);
    } catch (error) {
        // Swallowed deliberately - an OTP send failure here shouldn't
        // reveal anything different to the caller than the happy path.
    }

    res.json({
        success: true,
        message: "If an account exists for that email, we've sent a reset code."
    });
};

exports.resetPassword = async (req, res) => {
    try {
        await passwordResetService.resetPassword(req.body.email, req.body.code, req.body.new_password);

        res.json({ success: true, message: "Password reset. You can now sign in." });

    } catch (error) {
        res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

// Phase 4 (Testing & Session Hardening): logout is now a real endpoint
// rather than a purely client-side "forget the token" - the session
// cookie is httpOnly, so no amount of frontend JS can clear it; only a
// Set-Cookie response from the server (via res.clearCookie, which
// re-sends the cookie with an already-expired maxAge) actually removes
// it from the browser. res.clearCookie requires the exact same
// path/sameSite/secure options used when the cookie was set, or the
// browser treats it as a different cookie and leaves the real one alone
// - reusing sessionCookieOptions()/csrfCookieOptions() from login.
exports.logout = (req, res) => {
    res.clearCookie("nexora_session", sessionCookieOptions());
    res.clearCookie("nexora_csrf", csrfCookieOptions());
    res.json({ success: true, message: "Signed out." });
};

// Phase 4 (Testing & Session Hardening): with the session token no
// longer readable by frontend JS, the frontend can't just check "is
// there a token in localStorage" to know if someone's still signed in -
// it has to ask the server. AuthContext calls this on app load; a 401
// here (handled by auth.middleware, mounted on this route) means the
// cookie is missing, expired, or was invalidated (password change,
// suspension, etc.) exactly as it would for any other authenticated
// request.
exports.me = async (req, res) => {
    const user = await authRepository.findById(req.user.id);
    if (!user) {
        return res.status(401).json({ success: false, message: t(req.locale, "common.unauthorized") });
    }
    delete user.password;
    // Re-hydrates api/client.js's in-memory CSRF token on page load/reload
    // (that value doesn't survive a reload since it's memory-only - see
    // verifyLoginOtp above for why it can't just be read back out of the
    // cookie on the frontend). This isn't minting a new token, just
    // echoing back whatever nexora_csrf the browser already sent on this
    // request - the backend can read that fine either way, since the
    // restriction is specifically on cross-origin document.cookie access
    // from the frontend's own JS, not on the backend reading its own
    // cookies.
    res.json({ success: true, data: { user, csrfToken: req.cookies?.nexora_csrf || null } });
};
