// Phase 2 (Security Hardening). Wraps a multer instance so every upload
// route continues calling `.single(field)` / `.array(field, max)` /
// `.fields(spec)` exactly as before (no route file needed to change),
// but each now runs the given content-validation middleware right after
// multer finishes buffering the file(s) - see
// middleware/fileContentValidation.middleware.js and
// utils/fileContentValidator.js for what that checks and why.
//
// Express flattens arrays passed as router arguments, so returning
// `[multerMiddleware, contentValidationMiddleware]` here behaves
// identically to listing both as separate arguments in the route
// definition.
exports.wrapUpload = (multerInstance, contentValidationMiddleware) => ({
    single: (field) => [multerInstance.single(field), contentValidationMiddleware],
    array: (field, maxCount) => [multerInstance.array(field, maxCount), contentValidationMiddleware],
    fields: (fieldsSpec) => [multerInstance.fields(fieldsSpec), contentValidationMiddleware]
});
