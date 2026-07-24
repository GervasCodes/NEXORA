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

        // Phase 3 (Soft Account Deletion): a session token stays valid for
        // 7 days (utils/generateToken.js) regardless of what happens to the
        // account afterward, so blocking login alone isn't enough - a
        // still-unexpired token from before the account was deleted (or
        // admin-deactivated) would otherwise keep working for the rest of
        // its 7 days. Re-check fresh from the database on every request
        // instead of trusting the JWT for this, same reasoning
        // requireApprovedSeller.middleware.js already uses for
        // verification status.
        const status = await authRepository.findAccountStatusById(decoded.id);

        if (!status || !status.is_active) {
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
