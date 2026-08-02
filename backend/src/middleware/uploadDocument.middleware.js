const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");
const { wrapUpload } = require("../utils/wrapUploadMiddleware");

// Separate from upload.middleware.js (which is image-only for
// product/store photos) because verification documents like a business
// registration certificate are commonly scanned as PDFs.
const storage = multer.memoryStorage();

const uploadDocument = multer({
    storage,
    limits: {
        fileSize: 8 * 1024 * 1024 // 8 MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only image or PDF files are allowed."));
        }
    }
});

// Phase 2 (Security Hardening): second, content-based check independent
// of the client-reported mimetype above - see
// utils/fileContentValidator.js. "document" here covers PDF specifically
// (the classifier's zip/OLE office signatures aren't reachable through
// this middleware's own fileFilter above, which only ever admits
// image/* or application/pdf in the first place).
module.exports = wrapUpload(uploadDocument, validateFileContent(["image", "document"]));
