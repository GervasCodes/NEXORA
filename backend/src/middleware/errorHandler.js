const { t } = require("../i18n");
const logger = require("../utils/logger");

module.exports = (err, req, res, next) => {
    const status = err.status || 500;
    // 5xx is unexpected (bug, provider outage, DB blip) - error level.
    // 4xx is an expected/handled case (validation, not-found, auth) -
    // still worth a log line for debugging, but not the same "something
    // is broken" signal, so it's logged at warn instead. Sentry
    // reporting for the 5xx case is handled separately by
    // Sentry.setupExpressErrorHandler in app.js, which runs before this
    // middleware - this file's job is just structured logging.
    const log = status >= 500 ? logger.error : logger.warn;
    log({ err, status, path: req.originalUrl, method: req.method, reqId: req.id }, err.code || err.message);

    // Services increasingly throw `Object.assign(new Error(...), { code, status })`
    // (see notification.service.js, account errors, etc.) so the message shown
    // to the client can be translated via req.locale. Anything still throwing a
    // plain Error (message only, no code) falls back to that raw message, same
    // as before this existed.
    const message = err.code ? t(req.locale, `errors.${err.code}`) : (err.message || t(req.locale, "common.internalError"));

    res.status(status).json({
        success: false,
        message
    });
};
