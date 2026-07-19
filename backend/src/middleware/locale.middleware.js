const { resolveLocale, resolveFromAcceptLanguage, DEFAULT_LOCALE } = require("../i18n");

// Sets req.locale for every request, in priority order:
//   1. ?lang= query param (explicit override, e.g. a "view in Swahili"
//      link).
//   2. Accept-Language header - the frontend's api client attaches this
//      on every request based on the user's current LanguageContext
//      selection, so it reflects the truth right now even if it was
//      just changed in Settings.
//   3. DEFAULT_LOCALE ("en").
//
// req.localeExplicit marks (1) and (2): either way, a locale was
// actually communicated by this request, so auth.middleware below only
// falls back to the JWT's `language` claim (set at login - see
// auth/login.service.js) for clients that send neither, such as
// server-to-server or CLI callers.
module.exports = (req, res, next) => {
    if (req.query.lang) {
        req.locale = resolveLocale(req.query.lang);
        req.localeExplicit = true;
        return next();
    }

    if (req.headers["accept-language"]) {
        req.locale = resolveFromAcceptLanguage(req.headers["accept-language"]);
        req.localeExplicit = true;
        return next();
    }

    req.locale = DEFAULT_LOCALE;
    req.localeExplicit = false;

    next();
};
