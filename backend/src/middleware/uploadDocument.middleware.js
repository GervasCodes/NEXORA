const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");
const { wrapUpload } = require("../utils/wrapUploadMiddleware");
const { PDF_ONLY_FIELDS, isPdfOnlyField, hasImageExtension } = require("../utils/kycDocumentRules");

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
        // KYC document fields (national/voter ID, BRELA, TIN, business
        // license) accept PDF only - a photo/scan-as-image is rejected
        // here on both the declared mimetype and the file extension, and
        // again on the real file bytes in validateFileContent below.
        if (isPdfOnlyField(file.fieldname)) {
            if (file.mimetype === "application/pdf" && !hasImageExtension(file.originalname)) {
                cb(null, true);
            } else {
                cb(new Error("Verification documents must be uploaded as a PDF document, not as a photo or image."));
            }
            return;
        }

        if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only image or PDF files are allowed."));
        }
    }
});

//  (Security Hardening): second, content-based check independent
// of the client-reported mimetype above - see
// utils/fileContentValidator.js. "document" here covers PDF specifically
// (the classifier's zip/OLE office signatures aren't reachable through
// this middleware's own fileFilter above, which only ever admits
// image/* or application/pdf in the first place).
module.exports = wrapUpload(
    uploadDocument,
    validateFileContent(["image", "document"], { pdfOnlyFields: PDF_ONLY_FIELDS })
);
