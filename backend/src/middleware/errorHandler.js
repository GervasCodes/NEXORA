const { t } = require("../i18n");

module.exports = (err, req, res, next) => {
    console.error(err);

    // Services increasingly throw `Object.assign(new Error(...), { code, status })`
    // (see notification.service.js, account errors, etc.) so the message shown
    // to the client can be translated via req.locale. Anything still throwing a
    // plain Error (message only, no code) falls back to that raw message, same
    // as before this existed.
    const message = err.code ? t(req.locale, `errors.${err.code}`) : (err.message || t(req.locale, "common.internalError"));

    res.status(err.status || 500).json({
        success: false,
        message
    });
};
