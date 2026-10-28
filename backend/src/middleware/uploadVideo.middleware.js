const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");
const { wrapUpload } = require("../utils/wrapUploadMiddleware");

// Separate from upload.middleware.js (image-only, 5 MB) and
// uploadDocument.middleware.js (image/PDF, 8 MB) - product demo videos
// are a different media type entirely and need a much higher size cap
// than a photo or a scanned document.
const { MAX_VIDEO_BYTES } = require("../config/mediaLimits");

const storage = multer.memoryStorage();

const uploadVideo = multer({
    storage,
    limits: {
        fileSize: MAX_VIDEO_BYTES
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Only video files are allowed."));
        }
    }
});

// (Security Hardening): second, content-based check independent
// of the client-reported mimetype above - see
// utils/fileContentValidator.js.
module.exports = wrapUpload(uploadVideo, validateFileContent(["video"]));
