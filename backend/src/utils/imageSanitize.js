// Strips EXIF/GPS and other metadata from seller photos before they are
// uploaded, and bakes in the orientation so photos don't appear rotated.
// (A seller photographing stock at home would otherwise publish their GPS
// position inside the JPEG.)
//
// Formats libvips can't re-encode here (HEIC/HEIF, some AVIF, animated GIF)
// are passed through unchanged - Cloudinary converts those for delivery.
const logger = require("./logger").child({ module: "imageSanitize" });

const SUPPORTED = new Set(["jpeg", "png", "webp"]);

exports.stripImageMetadata = async (buffer) => {
    try {
        const sharp = require("sharp");
        const meta = await sharp(buffer).metadata();
        if (!SUPPORTED.has(meta.format)) return buffer;
        // No withMetadata(): sharp drops EXIF/ICC/XMP by default.
        return await sharp(buffer).rotate().toBuffer();
    } catch (err) {
        logger.warn({ err: err.message }, "metadata strip failed - uploading original");
        return buffer;
    }
};
