const https = require("https");
const cloudinary = require("../../config/cloudinary");
const productRepository = require("./product.repository");
const mediaRepository = require("./productMedia.repository");
const db = require("../../config/db");
const cache = require("../../utils/cache");
const logger = require("../../utils/logger").child({ module: "productMedia" });
const { deleteFromCloudinary, publicIdFromUrl } = require("../../utils/cloudinaryUpload");
const { scanBuffer } = require("../../utils/malwareScan");
const { normalizeVideoEdits, buildVideoUrl, buildPosterUrl, sanitizePhotoEdits } = require("../../utils/mediaTransforms");
const limits = require("../../config/mediaLimits");

const CACHE_NAMESPACE = "products";
const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "avif"];
const VIDEO_FORMATS = ["mp4", "mov", "webm", "m4v"];
const MAX_VIDEO_SECONDS = limits.MAX_VIDEO_SECONDS;

const bad = (message, status = 400, code) => Object.assign(new Error(message), { status, code });

const assertOwnsProduct = async (sellerId, productId) => {
    const product = await productRepository.findById(productId);
    if (!product || product.seller_id !== sellerId) throw bad("Product not found", 404);
    return product;
};

const folderFor = (productId, kind) => `products/media/${productId}/${kind}s`;

// Step 1 - the browser asks for permission to upload straight to Cloudinary.
// The signature covers the folder and format allow-list, so the file can only
// land in this product's folder and only as an allowed type.
exports.signUpload = async (sellerId, productId, kind) => {
    if (kind !== "image" && kind !== "video") throw bad("kind must be image or video");
    await assertOwnsProduct(sellerId, productId);

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET) {
        throw bad("Direct media upload is not configured on this server", 503, "DIRECT_UPLOAD_UNAVAILABLE");
    }

    const counts = await mediaRepository.countByKind(productId);
    const cap = kind === "image" ? limits.MAX_IMAGES_PER_PRODUCT : limits.MAX_VIDEOS_PER_PRODUCT;
    if (counts[kind] >= cap) throw bad(`A product can have at most ${cap} ${kind === "image" ? "photos" : "videos"}`);

    const params = {
        folder: folderFor(productId, kind),
        allowed_formats: (kind === "image" ? IMAGE_FORMATS : VIDEO_FORMATS).join(","),
        timestamp: Math.round(Date.now() / 1000)
    };
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);

    return {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        resourceType: kind,
        params,
        signature,
        uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${kind}/upload`,
        maxBytes: kind === "image" ? limits.MAX_IMAGE_BYTES : limits.MAX_VIDEO_BYTES,
        maxDurationS: kind === "video" ? MAX_VIDEO_SECONDS : null,
        chunkBytes: 6 * 1024 * 1024
    };
};

const download = (url, maxBytes) =>
    new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`download failed (${res.statusCode})`));
            }
            const chunks = [];
            let size = 0;
            res.on("data", (c) => {
                size += c.length;
                if (size > maxBytes) {
                    res.destroy();
                    return reject(new Error("file larger than allowed"));
                }
                chunks.push(c);
            });
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        }).on("error", reject);
    });

// Bytes no longer pass through our server, so the antivirus scan runs on a
// copy fetched back from Cloudinary (only when ClamAV is configured).
const scanUploaded = async (url, maxBytes, filename) => {
    if (!process.env.CLAMAV_HOST) return;
    const buffer = await download(url, maxBytes);
    const { infected } = await scanBuffer(buffer, filename);
    if (infected) throw bad("The uploaded file failed a security scan and was rejected.", 400, "MALWARE");
};

// Step 2 - after the browser finished uploading, the server verifies what is
// ACTUALLY on Cloudinary (never trusting client-reported numbers) and records it.
exports.registerMedia = async (sellerId, productId, { kind, publicId, edits }) => {
    if (kind !== "image" && kind !== "video") throw bad("kind must be image or video");
    await assertOwnsProduct(sellerId, productId);

    const folder = folderFor(productId, kind);
    if (typeof publicId !== "string" || !publicId.startsWith(`${folder}/`)) {
        throw bad("That file was not uploaded for this product");
    }

    const existing = await mediaRepository.findByPublicId(productId, publicId);
    if (existing) return existing;

    const counts = await mediaRepository.countByKind(productId);
    const cap = kind === "image" ? limits.MAX_IMAGES_PER_PRODUCT : limits.MAX_VIDEOS_PER_PRODUCT;
    if (counts[kind] >= cap) {
        await deleteFromCloudinary(`https://res.cloudinary.com/x/${kind}/upload/${publicId}`, kind);
        throw bad(`A product can have at most ${cap} ${kind === "image" ? "photos" : "videos"}`);
    }

    let asset;
    try {
        asset = await cloudinary.api.resource(publicId, { resource_type: kind });
    } catch (err) {
        logger.warn({ err: err.message, publicId }, "could not verify uploaded media");
        throw bad("We could not find that upload. Please try again.");
    }

    const reject = async (message) => {
        await deleteFromCloudinary(asset.secure_url, kind);
        throw bad(message);
    };

    const maxBytes = kind === "image" ? limits.MAX_IMAGE_BYTES : limits.MAX_VIDEO_BYTES;
    if (asset.bytes > maxBytes) return reject(`File is too large (max ${Math.round(maxBytes / 1048576)} MB).`);
    const allowed = kind === "image" ? IMAGE_FORMATS : VIDEO_FORMATS;
    if (!allowed.includes(String(asset.format).toLowerCase())) return reject("That file type is not allowed.");
    // The published clip (after the seller's trim) must be at most 60 s.
    if (kind === "video") {
        const trimmed = normalizeVideoEdits(edits, asset.duration);
        const playable = (trimmed.trimEnd === null ? Number(asset.duration) : trimmed.trimEnd) - trimmed.trimStart;
        if (playable > MAX_VIDEO_SECONDS + 1) {
            return reject(`Videos can be at most ${MAX_VIDEO_SECONDS} seconds.`);
        }
    }

    try {
        await scanUploaded(asset.secure_url, maxBytes, publicId);
    } catch (err) {
        await deleteFromCloudinary(asset.secure_url, kind);
        if (err.code === "MALWARE") throw err;
        logger.error({ err: err.message, publicId }, "post-upload scan failed");
        throw bad("The uploaded file couldn't be scanned right now. Please try again shortly.", 502);
    }

    let url = asset.secure_url;
    let posterUrl = null;
    let savedEdits;
    if (kind === "video") {
        savedEdits = normalizeVideoEdits(edits, asset.duration);
        url = buildVideoUrl(asset.secure_url, savedEdits);
        posterUrl = buildPosterUrl(asset.secure_url, savedEdits.coverTime);
    } else {
        savedEdits = sanitizePhotoEdits(edits);
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const position = await mediaRepository.nextPosition(productId, conn);
        const isFirstImage = kind === "image" && counts.image === 0;

        // Mirror into the legacy table so existing readers keep working.
        const legacyTable = kind === "image" ? "product_images" : "product_videos";
        const [[{ nextOrder }]] = await conn.query(
            `SELECT COALESCE(MAX(display_order), -1) + 1 AS nextOrder FROM ${legacyTable} WHERE product_id = ?`,
            [productId]
        );
        let legacyId;
        if (kind === "image") {
            const [r] = await conn.query(
                "INSERT INTO product_images (product_id, image_url, is_primary, display_order) VALUES (?, ?, ?, ?)",
                [productId, url, isFirstImage ? 1 : 0, nextOrder]
            );
            legacyId = r.insertId;
        } else {
            const [r] = await conn.query(
                "INSERT INTO product_videos (product_id, video_url, display_order) VALUES (?, ?, ?)",
                [productId, url, nextOrder]
            );
            legacyId = r.insertId;
        }

        const id = await mediaRepository.insert({
            productId, kind, url, publicId, posterUrl,
            width: asset.width, height: asset.height,
            durationS: kind === "video" ? asset.duration : null,
            bytes: asset.bytes, position, isCover: isFirstImage,
            edits: savedEdits, legacyId
        }, conn);
        await conn.commit();
        await cache.bumpVersion(CACHE_NAMESPACE);
        return mediaRepository.findById(productId, id);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

exports.listMedia = async (sellerId, productId) => {
    await assertOwnsProduct(sellerId, productId);
    await mediaRepository.syncFromLegacy(productId);
    return mediaRepository.list(productId);
};

// Single ordered array for photos and videos together, in one transaction.
exports.reorderMedia = async (sellerId, productId, ids, coverId) => {
    await assertOwnsProduct(sellerId, productId);
    const current = await mediaRepository.list(productId);
    const sameSet = ids.length === current.length && new Set(ids).size === ids.length
        && current.every((m) => ids.includes(m.id));
    if (!sameSet) throw bad("The list must contain every photo and video exactly once");

    const byId = new Map(current.map((m) => [m.id, m]));
    const ordered = ids.map((id) => byId.get(id));
    const firstImage = ordered.find((m) => m.kind === "image");
    let cover = coverId != null ? byId.get(coverId) : current.find((m) => m.is_cover);
    if (!cover || cover.kind !== "image") cover = firstImage;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await mediaRepository.applyOrder(conn, productId, ordered, cover ? cover.id : null);
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
    await cache.bumpVersion(CACHE_NAMESPACE);
    return mediaRepository.list(productId);
};

exports.deleteMedia = async (sellerId, productId, mediaId) => {
    await assertOwnsProduct(sellerId, productId);
    const item = await mediaRepository.findById(productId, mediaId);
    if (!item) throw bad("Media not found", 404);

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        if (item.legacy_id) {
            await conn.query(
                `DELETE FROM ${item.kind === "image" ? "product_images" : "product_videos"} WHERE id = ? AND product_id = ?`,
                [item.legacy_id, productId]
            );
        }
        await mediaRepository.remove(productId, mediaId, conn);
        // Keep exactly one cover when the cover photo is removed.
        if (item.is_cover) {
            const remaining = (await mediaRepository.list(productId, conn)).find((m) => m.kind === "image");
            if (remaining) {
                await conn.query("UPDATE product_media SET is_cover = 1 WHERE id = ?", [remaining.id]);
                if (remaining.legacy_id) {
                    await conn.query("UPDATE product_images SET is_primary = 1 WHERE id = ?", [remaining.legacy_id]);
                }
            }
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    // Delete the original asset (the URL may carry delivery transformations).
    const publicId = item.public_id || publicIdFromUrl(item.url);
    if (publicId) deleteFromCloudinary(`https://res.cloudinary.com/x/${item.kind}/upload/${publicId}`, item.kind);
    await cache.bumpVersion(CACHE_NAMESPACE);
};
