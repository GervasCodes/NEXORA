const multer = require("multer");

// Chat attachments cover more ground than the image-only upload.middleware.js
// (a "premium modern chat" needs photos, short clips, voice notes, and
// documents like a receipt PDF), so this gets its own middleware with a
// wider fileFilter and a larger limit than product/review photos.
const storage = multer.memoryStorage();

const ALLOWED_PREFIXES = ["image/", "video/", "audio/"];
const ALLOWED_EXACT = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain"
];

const uploadChatAttachment = multer({
    storage,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15 MB
    },
    fileFilter: (req, file, cb) => {
        const allowed =
            ALLOWED_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix)) ||
            ALLOWED_EXACT.includes(file.mimetype);

        if (allowed) {
            cb(null, true);
        } else {
            cb(new Error("That file type isn't supported for attachments."));
        }
    }
});

module.exports = uploadChatAttachment;
