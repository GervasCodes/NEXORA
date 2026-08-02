const multer = require("multer");
const { validateFileContent } = require("./fileContentValidation.middleware");
const { wrapUpload } = require("../utils/wrapUploadMiddleware");

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed."));
        }
    }
});

// Phase 2 (Security Hardening): the fileFilter above only trusts the
// client-reported mimetype - this adds a second, independent check of
// the actual bytes (see utils/fileContentValidator.js). Every call site
// still calls `upload.single("field")` etc. exactly as before.
module.exports = wrapUpload(upload, validateFileContent(["image"]));