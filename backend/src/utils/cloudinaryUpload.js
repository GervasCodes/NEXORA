const cloudinary = require("../config/cloudinary");

exports.uploadToCloudinary = (fileBuffer, folder = "nexora", resourceType = "image") => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        stream.end(fileBuffer);
    });
};

// Phase 4: pull the Cloudinary public_id out of a delivery URL such as
//   https://res.cloudinary.com/<cloud>/image/upload/v123/products/abc.jpg
// -> "products/abc". Returns null for URLs that aren't Cloudinary uploads.
exports.publicIdFromUrl = (url) => {
    // Skips delivery transformation segments (so_2,eo_10 / e_volume:mute / f_auto)
    // and the optional version before capturing the public id.
    const match = /\/upload\/(?:[a-z]{1,3}_[^/]*\/)*(?:v\d+\/)?([^?#]+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i.exec(String(url || ""));
    if (!match || !/res\.cloudinary\.com/.test(url)) return null;
    return match[1];
};

// Best-effort delete of an asset that has been removed from the app, so
// orphaned files don't pile up (and keep costing storage). Never throws:
// a failed cleanup must not fail the seller's request.
exports.deleteFromCloudinary = async (url, resourceType = "image") => {
    const publicId = exports.publicIdFromUrl(url);
    if (!publicId) return false;
    try {
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
        return result?.result === "ok";
    } catch (err) {
        require("./logger").child({ module: "cloudinary" }).warn({ err: err.message, publicId }, "asset delete failed");
        return false;
    }
};
