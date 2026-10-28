const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");

// One small spreadsheet (.csv / .xlsx) in the form field "file" (Stock Management import,
// Phase 8). Same safety layers as image uploads: a hard size limit, a check of the real
// bytes (a .xlsx must be a zip-based office file, a .csv must look like plain text), and
// the malware scan. The file is parsed in memory and never written to disk.

const MAX_BYTES = 2 * 1024 * 1024;

const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

// Browsers label a CSV "text/csv", "application/csv" or even "application/vnd.ms-excel".
// The content validator accepts plain text only when it is declared text/plain, so a file that
// is named .csv / .txt (and isn't a zip) is relabelled; the validator then checks the bytes.
const normaliseCsvMime = (req, res, next) => {
    const f = req.file;
    if (f && /\.(csv|txt)$/i.test(f.originalname || "") && !(f.buffer && f.buffer[0] === 0x50 && f.buffer[1] === 0x4b)) {
        f.mimetype = "text/plain";
    }
    next();
};

const content = validateFileContent(["document"], { allowPlainText: true });

const handleMulter = (middleware) => (req, res, next) => {
    middleware(req, res, (error) => {
        if (!error) return next();
        const tooBig = error.code === "LIMIT_FILE_SIZE";
        return res.status(tooBig ? 413 : 400).json({
            success: false,
            message: tooBig ? "The file is too large (2 MB at most)." : "The file couldn't be read."
        });
    });
};

exports.single = (field = "file") => [handleMulter(uploader.single(field)), normaliseCsvMime, content];
exports.MAX_BYTES = MAX_BYTES;
