const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");
const { wrapUpload } = require("../utils/wrapUploadMiddleware");

// Separate from upload.middleware.js (image, 5 MB), uploadDocument.middleware.js
// (image/PDF, 8 MB), and uploadVideo.middleware.js (video, 50 MB) - audio
// clips are smaller than video but still need their own mimetype filter
// and a higher cap than a photo.
const storage = multer.memoryStorage();

const uploadAudio = multer({
    storage,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15 MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("audio/")) {
            cb(null, true);
        } else {
            cb(new Error("Only audio files are allowed."));
        }
    }
});

// Phase 2 (Security Hardening): second, content-based check independent
// of the client-reported mimetype above - see
// utils/fileContentValidator.js.
module.exports = wrapUpload(uploadAudio, validateFileContent(["audio"]));
