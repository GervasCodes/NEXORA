const jwt = require("jsonwebtoken");
const { t, resolveLocale } = require("../i18n");
const authRepository = require("../modules/auth/auth.repository");

module.exports = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: t(req.locale, "common.unauthorized")
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Short-lived tokens (login pre-auth, password-change reauth) carry
        // a `typ` claim and are only ever accepted by their own dedicated
        // endpoints - never as a general session token.
        if (decoded.typ) {
            return res.status(401).json({
                success: false,
                message: t(req.locale, "common.invalidToken")
            });
        }

       
        const status = await authRepository.findAccountStatusById(decoded.id);

        if (!status || !status.is_active) {
            // A suspended account gets its own code + reason (rather than
            // the generic 401 below) so the frontend can route straight to
            // the full-screen suspended page instead of silently signing
            // the person out as if their session had merely expired - see
            // api/client.js's response interceptor.
            if (status && status.suspended_at) {
                return res.status(403).json({
                    success: false,
                    code: "ACCOUNT_SUSPENDED",
                    message: t(req.locale, "errors.ACCOUNT_SUSPENDED"),
                    data: { reason: status.suspension_reason || null }
                });
            }

            return res.status(401).json({
                success: false,
                message: t(req.locale, "common.unauthorized")
            });
        }

        req.user = decoded;

        // The account's saved language (see auth/login.service.js, which
        // bakes it into the token at login) is authoritative for a signed-in
        // user - unless the request explicitly asked for a different locale
        // via ?lang=, which locale.middleware already recorded.
        if (!req.localeExplicit && decoded.language) {
            req.locale = resolveLocale(decoded.language);
        }

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: t(req.locale, "common.invalidToken")
        });
    }
};
