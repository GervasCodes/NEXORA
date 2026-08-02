// Phase 2 (Security Hardening) - see utils/fileContentValidator.js for
// why this exists. This middleware runs AFTER multer (memoryStorage) has
// already buffered the file(s) into req.file/req.files, so it works
// whether the route used `.single()`, `.array()`, or `.fields()`.
const { classify, looksLikePlainText, logRejection } = require("../utils/fileContentValidator");

const collectFiles = (req) => {
    const files = [];
    if (req.file) {
        files.push(req.file);
    }
    if (req.files) {
        if (Array.isArray(req.files)) {
            files.push(...req.files);
        } else {
            Object.values(req.files).forEach((group) => files.push(...group));
        }
    }
    return files;
};

// allowedCategories: subset of "image" | "video" | "audio" | "document".
// allowPlainText: also accept a file whose declared mimetype is exactly
// "text/plain" and whose content passes the plain-text heuristic (no
// magic number exists for text, so this is the one category that can't
// be verified by signature alone).
exports.validateFileContent = (allowedCategories, { allowPlainText = false } = {}) => (req, res, next) => {
    const files = collectFiles(req);

    if (files.length === 0) {
        return next();
    }

    for (const file of files) {
        const buffer = file.buffer;

        if (!buffer || buffer.length === 0) {
            logRejection({ reqId: req.id, field: file.fieldname });
            return res.status(400).json({
                success: false,
                message: `${file.originalname || "The uploaded file"} is empty.`
            });
        }

        const detected = classify(buffer);

        if (detected && allowedCategories.includes(detected.category)) {
            continue;
        }

        if (!detected && allowPlainText && file.mimetype === "text/plain" && looksLikePlainText(buffer)) {
            continue;
        }

        logRejection({
            reqId: req.id,
            field: file.fieldname,
            declaredMimetype: file.mimetype,
            detectedCategory: detected?.category || null
        });

        return res.status(400).json({
            success: false,
            message: `${file.originalname || "The uploaded file"}'s content doesn't match an allowed file type.`
        });
    }

    return next();
};
