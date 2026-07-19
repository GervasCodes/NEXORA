// Creates an Error tagged with `code` (a key under the "errors" namespace
// in backend/src/i18n/locales/*.js) and an HTTP `status`. errorHandler.js
// translates `code` into the request's locale; anything that throws a
// plain `new Error("...")` still works exactly as before (English only).
const appError = (code, status = 400) => Object.assign(new Error(code), { code, status });

module.exports = appError;
