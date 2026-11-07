#!/usr/bin/env node
/**
 * Phase 4 cleanup for the removed product-audio feature.
 *
 *   node backend/scripts/purgeProductAudio.js --dry-run   (count only)
 *   node backend/scripts/purgeProductAudio.js             (delete Cloudinary files)
 *
 * 1. Counts rows in product_audio.
 * 2. Deletes each clip's asset from Cloudinary (resource_type=video, the
 *    folder products/audio).
 * It does NOT drop the table - see database/deferred/drop_product_audio.sql,
 * to be run in a later release once this one is stable.
 * Safe to re-run: deleting an already-deleted asset is harmless.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const db = require("../src/config/db");
const { deleteFromCloudinary } = require("../src/utils/cloudinaryUpload");

const DRY_RUN = process.argv.includes("--dry-run");

(async () => {
    let rows;
    try {
        [rows] = await db.query("SELECT id, audio_url FROM product_audio");
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            console.log("product_audio table does not exist - nothing to do.");
            process.exit(0);
        }
        throw err;
    }

    console.log(`product_audio rows: ${rows.length}`);
    if (DRY_RUN || rows.length === 0) process.exit(0);

    let deleted = 0;
    let failed = 0;
    for (const row of rows) {
        const ok = await deleteFromCloudinary(row.audio_url, "video");
        if (ok) deleted += 1;
        else failed += 1;
    }
    console.log(`Cloudinary assets deleted: ${deleted}, not deleted (missing/failed): ${failed}`);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
