const jwt = require("jsonwebtoken");
const { t, resolveLocale } = require("../i18n");

module.exports = (req, res, next) => {
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
