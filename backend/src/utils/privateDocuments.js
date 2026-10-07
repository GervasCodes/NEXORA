const cloudinary = require("../config/cloudinary");
const logger = require("./logger").child({ module: "private-documents" });

// Identity and business documents (ID, KYC, BRELA, TIN, licence) are
// uploaded as Cloudinary *authenticated* assets: they have no public
// delivery URL at all. The database keeps only the public_id, resource
// type and format; an admin who clicks "view" gets a short-lived signed
// download URL from the backend (see modules/documentAccess).

const DEFAULT_TTL_SECONDS = 120;
const MAX_TTL_SECONDS = 600;

const ttlSeconds = () => {
    const configured = Number(process.env.DOCUMENT_URL_TTL_SECONDS);
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TTL_SECONDS;
    return Math.min(configured, MAX_TTL_SECONDS);
};

exports.uploadPrivateDocument = (fileBuffer, folder) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "auto", type: "authenticated" },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    publicId: result.public_id,
                    resourceType: result.resource_type,
                    format: result.format || null
                });
            }
        );
        stream.end(fileBuffer);
    });

// `doc` is a row from account_verification_documents / kyc_upgrade_requests.
// Returns null when there is nothing private to sign (legacy public row, or
// a file already purged).
exports.getSignedDocumentUrl = (doc, { ttl = ttlSeconds() } = {}) => {
    if (!doc || doc.file_storage !== "authenticated" || !doc.file_public_id || doc.file_purged_at) {
        return null;
    }

    const expiresAt = Math.floor(Date.now() / 1000) + Math.min(ttl, MAX_TTL_SECONDS);

    return {
        url: cloudinary.utils.private_download_url(doc.file_public_id, doc.file_format || "", {
            resource_type: doc.file_resource_type || "image",
            type: "authenticated",
            expires_at: expiresAt
        }),
        expiresAt: new Date(expiresAt * 1000).toISOString()
    };
};

// Deletes one stored document asset, public or private. Never throws:
// callers run this after their database work has committed.
exports.deleteStoredDocument = async (doc) => {
    try {
        if (doc.file_storage === "authenticated" && doc.file_public_id) {
            await cloudinary.uploader.destroy(doc.file_public_id, {
                resource_type: doc.file_resource_type || "image",
                type: "authenticated"
            });
            return true;
        }
        if (doc.file_url) {
            const { deleteFromCloudinary } = require("./cloudinaryDelete");
            return deleteFromCloudinary(doc.file_url);
        }
        return false;
    } catch (error) {
        logger.warn({ err: error, publicId: doc.file_public_id }, "failed to delete stored document");
        return false;
    }
};

// Never send raw storage columns to a client.
exports.toClientDocument = (row) => {
    if (!row) return row;
    const {
        file_url, file_public_id, file_resource_type, file_format, file_storage, file_purged_at,
        ...rest
    } = row;
    return { ...rest, has_file: !file_purged_at && !!(file_public_id || file_url), purged: !!file_purged_at };
};
