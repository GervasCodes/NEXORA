#!/usr/bin/env node
/**
 * Moves existing public verification / KYC document assets to Cloudinary
 * "authenticated" delivery and updates their rows.
 *
 *   node backend/scripts/migrateDocumentsToPrivate.js --dry-run   (list only)
 *   node backend/scripts/migrateDocumentsToPrivate.js             (migrate)
 *
 * Run migration 129 first. Safe to re-run: only rows still marked
 * file_storage = 'public' are touched, and each row is updated only after
 * its asset has been moved. Failures are printed and the exit code is 1.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const db = require("../src/config/db");
const cloudinary = require("../src/config/cloudinary");

const DRY_RUN = process.argv.includes("--dry-run");
const TABLES = ["account_verification_documents", "kyc_upgrade_requests"];

const parseCloudinaryUrl = (url) => {
    const match = typeof url === "string" && url.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;
    const [, resourceType, pathWithExt] = match;
    const extMatch = pathWithExt.match(/\.([a-zA-Z0-9]+)$/);
    return {
        resourceType,
        publicId: decodeURIComponent(pathWithExt.replace(/\.[a-zA-Z0-9]+$/, "")),
        format: extMatch ? extMatch[1].toLowerCase() : null
    };
};

(async () => {
    let moved = 0;
    let failed = 0;

    for (const table of TABLES) {
        const [rows] = await db.query(
            `SELECT id, file_url FROM ${table}
            WHERE file_storage = 'public' AND file_url IS NOT NULL AND file_purged_at IS NULL`
        );

        for (const row of rows) {
            const parsed = parseCloudinaryUrl(row.file_url);
            if (!parsed) {
                console.error(`[${table} #${row.id}] not a Cloudinary upload URL, skipped`);
                failed += 1;
                continue;
            }
            if (DRY_RUN) {
                console.log(`[${table} #${row.id}] would move ${parsed.resourceType}/${parsed.publicId}`);
                continue;
            }

            try {
                await cloudinary.uploader.rename(parsed.publicId, parsed.publicId, {
                    resource_type: parsed.resourceType,
                    type: "upload",
                    to_type: "authenticated",
                    overwrite: true,
                    invalidate: true
                });

                // The row switches only after the asset is private. Until
                // this UPDATE the old URL is dead, which is the safe side.
                await db.query(
                    `UPDATE ${table}
                    SET file_public_id = ?, file_resource_type = ?, file_format = ?,
                        file_storage = 'authenticated', file_url = NULL
                    WHERE id = ? AND file_storage = 'public'`,
                    [parsed.publicId, parsed.resourceType, parsed.format, row.id]
                );
                moved += 1;
            } catch (error) {
                failed += 1;
                console.error(`[${table} #${row.id}] failed: ${error.message || JSON.stringify(error)}`);
            }
        }
    }

    console.log(`${DRY_RUN ? "Dry run. " : ""}Moved: ${moved}, failed/skipped: ${failed}`);
    await db.end?.();
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
