const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");
const { wrapUpload } = require("../utils/wrapUploadMiddleware");

// Separate from upload.middleware.js (image-only, 5 MB) and
// uploadDocument.middleware.js (image/PDF, 8 MB) - product demo videos
// are a different media type entirely and need a much higher size cap
// than a photo or a scanned document.
const storage = multer.memoryStorage();

const uploadVideo = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50 MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Only video files are allowed."));
        }
    }
});

// Phase 2 (Security Hardening): second, content-based check independent
// of the client-reported mimetype above - see
// utils/fileContentValidator.js.
module.exports = wrapUpload(uploadVideo, validateFileContent(["video"]));
