const documentAccessRepository = require("./documentAccess.repository");
const auditRepository = require("../audit/audit.repository");
const { getSignedDocumentUrl } = require("../../utils/privateDocuments");

const httpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

// Admin clicks "view" on a document -> a signed URL that expires within
// minutes. Every request is written to the audit log, because these are the
// most sensitive files on the platform.
exports.getDocumentUrl = async (kind, id, { adminId, req } = {}) => {
    if (!documentAccessRepository.KINDS.includes(kind)) {
        throw httpError(400, "Unknown document type.");
    }

    const doc = await documentAccessRepository.findDocument(kind, id);
    if (!doc) throw httpError(404, "Document not found.");
    if (doc.file_purged_at) {
        throw httpError(410, "This document was removed under the retention policy.");
    }

    let result;
    if (doc.file_storage === "authenticated") {
        result = getSignedDocumentUrl(doc);
    } else if (doc.file_url) {
        // Not migrated yet (see scripts/migrateDocumentsToPrivate.js).
        result = { url: doc.file_url, expiresAt: null, legacy: true };
    }

    if (!result) throw httpError(404, "This document has no stored file.");

    // Awaited, and the URL is withheld if the access cannot be recorded:
    // viewing one of these files without a trace is not acceptable.
    try {
        await auditRepository.insertLog({
            userId: adminId,
            eventType: "document_viewed",
            description: `Admin opened ${kind} document #${doc.id} belonging to user #${doc.user_id}`,
            ipAddress: req?.ip || null,
            metadata: { kind, document_id: doc.id, owner_user_id: doc.user_id, legacy: !!result.legacy }
        });
    } catch (error) {
        throw httpError(500, "Could not record this access in the audit log, so the document was not opened. Try again.");
    }

    return result;
};
