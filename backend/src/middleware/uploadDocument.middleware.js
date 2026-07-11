const multer = require("multer");

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

module.exports = uploadDocument;
