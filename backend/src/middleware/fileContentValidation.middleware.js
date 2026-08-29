// Phase 2 (Security Hardening) - see utils/fileContentValidator.js for
// why this exists. This middleware runs AFTER multer (memoryStorage) has
// already buffered the file(s) into req.file/req.files, so it works
// whether the route used `.single()`, `.array()`, or `.fields()`.
const { classify, looksLikePlainText, logRejection } = require("../utils/fileContentValidator");
const { scanBuffer } = require("../utils/malwareScan");
const logger = require("../utils/logger").child({ module: "fileContentValidation" });

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
exports.validateFileContent = (allowedCategories, { allowPlainText = false } = {}) => async (req, res, next) => {
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
        const typeOk =
            (detected && allowedCategories.includes(detected.category)) ||
            (!detected && allowPlainText && file.mimetype === "text/plain" && looksLikePlainText(buffer));

        if (!typeOk) {
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

        // Malware scan runs after the type check so an obviously-wrong
        // upload gets rejected on that cheaper check first, without ever
        // hitting the scanning service. See utils/malwareScan.js - fails
        // OPEN (upload proceeds unscanned) when CLAMAV_HOST isn't set at
        // all, in every environment; once it IS set, a real scan runs
        // and either an infected file or a scan failure rejects the
        // upload below.
        try {
            const { infected } = await scanBuffer(buffer, file.originalname);

            if (infected) {
                logger.warn({ reqId: req.id, field: file.fieldname }, "[upload] rejected file - malware detected");
                return res.status(400).json({
                    success: false,
                    message: `${file.originalname || "The uploaded file"} failed a security scan and was rejected.`
                });
            }
        } catch (err) {
            logger.error({ reqId: req.id, field: file.fieldname, err }, "[upload] malware scan failed");
            return res.status(502).json({
                success: false,
                message: "The uploaded file couldn't be scanned right now. Please try again shortly."
            });
        }
    }

    return next();
};
