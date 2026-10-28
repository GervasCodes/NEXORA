// Phase 4: client-side mirror of backend/src/config/mediaLimits.js - keep in
// sync. Checking here saves a seller from uploading 50 MB over mobile data
// only to be told "too large".
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 10;
export const MAX_VIDEOS_PER_PRODUCT = 3;
export const MAX_VIDEO_SECONDS = 60;

const mb = (bytes) => Math.round(bytes / (1024 * 1024));

// Returns null when the file is acceptable, otherwise { key, params } for a
// translated message.
export function checkMediaFile(file, kind) {
    if (!file) return null;
    if (kind === "image") {
        const isImage = file.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(file.name || "");
        if (!isImage) return { key: "media.notImage", params: { name: file.name } };
        if (file.size > MAX_IMAGE_BYTES) return { key: "media.tooLarge", params: { name: file.name, max: mb(MAX_IMAGE_BYTES) } };
    } else {
        if (!file.type.startsWith("video/")) return { key: "media.notVideo", params: { name: file.name } };
        if (file.size > MAX_VIDEO_BYTES) return { key: "media.tooLarge", params: { name: file.name, max: mb(MAX_VIDEO_BYTES) } };
    }
    return null;
}
