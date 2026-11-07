const db = require("../../config/db");

// Phase 5: unified gallery (see migration 156). Every row is mirrored into
// product_images / product_videos (legacy_id) so existing readers still work.

const COLUMNS = `id, product_id, kind, url, public_id, poster_url, width, height,
    duration_s, bytes, position, is_cover, edits, legacy_id`;

exports.list = async (productId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT ${COLUMNS} FROM product_media WHERE product_id = ? ORDER BY position ASC, id ASC`,
        [productId]
    );
    return rows;
};

exports.findById = async (productId, mediaId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT ${COLUMNS} FROM product_media WHERE id = ? AND product_id = ?`,
        [mediaId, productId]
    );
    return rows[0];
};

exports.findByPublicId = async (productId, publicId) => {
    const [rows] = await db.query(
        `SELECT ${COLUMNS} FROM product_media WHERE product_id = ? AND public_id = ?`,
        [productId, publicId]
    );
    return rows[0];
};

exports.countByKind = async (productId) => {
    const [rows] = await db.query(
        "SELECT kind, COUNT(*) AS n FROM product_media WHERE product_id = ? GROUP BY kind",
        [productId]
    );
    const out = { image: 0, video: 0 };
    for (const r of rows) out[r.kind] = Number(r.n);
    return out;
};

exports.nextPosition = async (productId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM product_media WHERE product_id = ?",
        [productId]
    );
    return Number(rows[0].next);
};

exports.insert = async (row, executor = db) => {
    const [result] = await executor.query(
        `INSERT INTO product_media
         (product_id, kind, url, public_id, poster_url, width, height, duration_s, bytes,
          position, is_cover, edits, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            row.productId, row.kind, row.url, row.publicId || null, row.posterUrl || null,
            row.width || null, row.height || null, row.durationS ?? null, row.bytes || null,
            row.position, row.isCover ? 1 : 0, row.edits ? JSON.stringify(row.edits) : null,
            row.legacyId ?? null
        ]
    );
    return result.insertId;
};

exports.remove = async (productId, mediaId, executor = db) => {
    const [result] = await executor.query(
        "DELETE FROM product_media WHERE id = ? AND product_id = ?",
        [mediaId, productId]
    );
    return result.affectedRows > 0;
};

// Sets position for each id (array index) and the cover flag, mirroring the
// order into the legacy tables - all inside the caller's transaction.
exports.applyOrder = async (conn, productId, items, coverId) => {
    let imageOrder = 0;
    let videoOrder = 0;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const isCover = item.kind === "image" && item.id === coverId;
        await conn.query(
            "UPDATE product_media SET position = ?, is_cover = ? WHERE id = ? AND product_id = ?",
            [index, isCover ? 1 : 0, item.id, productId]
        );
        if (item.legacy_id) {
            if (item.kind === "image") {
                await conn.query(
                    "UPDATE product_images SET display_order = ?, is_primary = ? WHERE id = ? AND product_id = ?",
                    [imageOrder, isCover ? 1 : 0, item.legacy_id, productId]
                );
            } else {
                await conn.query(
                    "UPDATE product_videos SET display_order = ? WHERE id = ? AND product_id = ?",
                    [videoOrder, item.legacy_id, productId]
                );
            }
        }
        if (item.kind === "image") imageOrder += 1;
        else videoOrder += 1;
    }
};

// Bring product_media in line with the legacy tables, for products that were
// edited through the old form (or before migration 156): add rows for legacy
// media that has none, and drop rows whose legacy row no longer exists.
exports.syncFromLegacy = async (productId) => {
    await db.query(
        `INSERT INTO product_media (product_id, kind, url, position, is_cover, legacy_id)
         SELECT pi.product_id, 'image', pi.image_url,
                (SELECT COALESCE(MAX(position), -1) FROM product_media WHERE product_id = pi.product_id)
                  + ROW_NUMBER() OVER (ORDER BY pi.display_order, pi.id),
                pi.is_primary, pi.id
         FROM product_images pi
         WHERE pi.product_id = ?
           AND NOT EXISTS (SELECT 1 FROM product_media pm
                           WHERE pm.product_id = pi.product_id AND pm.kind = 'image' AND pm.legacy_id = pi.id)`,
        [productId]
    );
    await db.query(
        `INSERT INTO product_media (product_id, kind, url, position, is_cover, legacy_id)
         SELECT pv.product_id, 'video', pv.video_url,
                (SELECT COALESCE(MAX(position), -1) FROM product_media WHERE product_id = pv.product_id)
                  + ROW_NUMBER() OVER (ORDER BY pv.display_order, pv.id),
                FALSE, pv.id
         FROM product_videos pv
         WHERE pv.product_id = ?
           AND NOT EXISTS (SELECT 1 FROM product_media pm
                           WHERE pm.product_id = pv.product_id AND pm.kind = 'video' AND pm.legacy_id = pv.id)`,
        [productId]
    );
    await db.query(
        `DELETE pm FROM product_media pm
         LEFT JOIN product_images pi ON pm.kind = 'image' AND pi.id = pm.legacy_id
         LEFT JOIN product_videos pv ON pm.kind = 'video' AND pv.id = pm.legacy_id
         WHERE pm.product_id = ? AND pm.legacy_id IS NOT NULL AND pi.id IS NULL AND pv.id IS NULL`,
        [productId]
    );
};
