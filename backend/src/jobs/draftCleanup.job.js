// Phase 4: sellers start drafts (which create photos/videos in Cloudinary on
// the way) and abandon them. After DRAFT_MAX_AGE_DAYS untouched, delete the
// draft and its cloud assets so storage doesn't grow forever.
//
// Only rows that are still drafts AND have never been ordered/wishlisted
// are removed; anything the delete refuses (foreign keys) is left alone and
// logged, never forced.
const db = require("../config/db");
const logger = require("../utils/logger").child({ module: "job:draftCleanup" });
const { deleteFromCloudinary } = require("../utils/cloudinaryUpload");
const { DRAFT_MAX_AGE_DAYS } = require("../config/mediaLimits");

const BATCH = 50;

exports.run = async () => {
    const [drafts] = await db.query(
        `SELECT id FROM products
         WHERE is_draft = TRUE AND updated_at < (NOW() - INTERVAL ? DAY)
         ORDER BY id ASC LIMIT ?`,
        [DRAFT_MAX_AGE_DAYS, BATCH]
    );

    let removed = 0;
    for (const { id } of drafts) {
        try {
            const [images] = await db.query("SELECT image_url AS url FROM product_images WHERE product_id = ?", [id]);
            const [videos] = await db.query("SELECT video_url AS url FROM product_videos WHERE product_id = ?", [id]);
            const [result] = await db.query("DELETE FROM products WHERE id = ? AND is_draft = TRUE", [id]);
            if (!result.affectedRows) continue;
            removed += 1;
            await Promise.all([
                ...images.map((r) => deleteFromCloudinary(r.url, "image")),
                ...videos.map((r) => deleteFromCloudinary(r.url, "video"))
            ]);
        } catch (err) {
            logger.warn({ err: err.message, productId: id }, "could not remove abandoned draft");
        }
    }

    if (removed) logger.info({ removed }, "removed abandoned product draft(s)");
};
