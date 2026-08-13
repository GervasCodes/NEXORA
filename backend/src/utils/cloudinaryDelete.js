const cloudinary = require("../config/cloudinary");
const logger = require("./logger").child({ module: "cloudinary-delete" });

// Nothing in the schema stores a Cloudinary public_id or resource_type
// separately - every table that references an uploaded asset
// (product_images.image_url, seller_profiles.store_logo,
// account_verification_documents.file_url, etc.) only stores the
// secure_url uploadToCloudinary() returned (see cloudinaryUpload.js).
// Permanent deletion needs to remove the asset itself, not just the DB
// row pointing at it, so this recovers what cloudinary.uploader.destroy()
// needs directly from that URL instead.
//
// A Cloudinary delivery URL looks like:
//   https://res.cloudinary.com/<cloud>/<resource_type>/upload/v<version>/<public_id>.<ext>
// resource_type is always one of image/video/raw in the URL itself, even
// for uploads made with resourceType: "auto" (auth.service.js's document
// upload, dispute.service.js's evidence upload) - Cloudinary resolves
// "auto" to a concrete type at upload time and bakes it into the URL, so
// reading it back out of the URL is more reliable than trying to guess
// it again from a file extension.
const parseCloudinaryUrl = (url) => {
    if (!url || typeof url !== "string") return null;

    const match = url.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;

    const [, resourceType, pathWithExt] = match;
    const publicId = pathWithExt.replace(/\.[a-zA-Z0-9]+$/, "");

    return { resourceType, publicId };
};

// Best-effort, single asset. Failures (asset already gone, malformed
// URL, Cloudinary outage) are logged and swallowed rather than thrown -
// same reasoning as audit.service.js's fire-and-forget logging: losing
// track of one leftover image is far better than aborting the rest of an
// account's permanent-deletion transaction, or worse, leaving it
// half-applied, over a single Cloudinary call failing.
exports.deleteFromCloudinary = async (url) => {
    const parsed = parseCloudinaryUrl(url);
    if (!parsed) return false;

    try {
        await cloudinary.uploader.destroy(parsed.publicId, {
            resource_type: parsed.resourceType
        });
        return true;

    } catch (error) {
        logger.warn({ err: error, publicId: parsed.publicId }, "failed to delete cloudinary asset");
        return false;
    }
};

// Convenience wrapper for a batch of URLs (a seller's product photos, a
// user's verification documents, ...). Runs in parallel and never
// rejects - callers just get back the list of URLs that failed so they
// can decide whether to surface that, same shape as Promise.allSettled
// but pre-filtered to the failures only.
exports.deleteManyFromCloudinary = async (urls = []) => {
    const unique = [...new Set(urls.filter(Boolean))];

    const results = await Promise.all(
        unique.map(async (url) => ({ url, ok: await exports.deleteFromCloudinary(url) }))
    );

    return results.filter((r) => !r.ok).map((r) => r.url);
};
