// Phase 4: product-media limits in ONE place. The frontend mirrors these in
// frontend/src/utils/mediaLimits.js - keep both files in sync.
module.exports = {
    MAX_IMAGE_BYTES: 5 * 1024 * 1024,
    MAX_VIDEO_BYTES: 50 * 1024 * 1024,
    MAX_IMAGES_PER_PRODUCT: 10,
    MAX_VIDEOS_PER_PRODUCT: 3,
    // How many video uploads may be buffered in memory at once on one
    // process (each can be up to MAX_VIDEO_BYTES).
    MAX_VIDEO_SECONDS: 60,
    MAX_CONCURRENT_VIDEO_UPLOADS: 4,
    // Drafts untouched for this long are purged (with their cloud assets).
    DRAFT_MAX_AGE_DAYS: 30
};
