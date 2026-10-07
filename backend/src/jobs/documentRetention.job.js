// Removes the stored file of approved verification / KYC documents once the
// admin-set retention period has passed. The row itself (document type,
// upload date, review history) stays; only the file is deleted and the row
// is marked purged. approved_document_retention_days = 0 turns this off.

const db = require("../config/db");
const settingsService = require("../modules/settings/settings.service");
const { deleteStoredDocument } = require("../utils/privateDocuments");
const logger = require("../utils/logger").child({ module: "job:documentRetention" });

const BATCH_SIZE = 100;

// Each query returns documents whose approval is older than the cut-off.
const DUE_QUERIES = [
    {
        table: "account_verification_documents",
        sql: `SELECT d.id, d.file_url, d.file_public_id, d.file_resource_type, d.file_storage
            FROM account_verification_documents d
            JOIN users u ON u.id = d.user_id
            LEFT JOIN business_verification_requests b ON b.id = d.business_request_id
            WHERE d.file_purged_at IS NULL
              AND (d.file_public_id IS NOT NULL OR d.file_url IS NOT NULL)
              AND (
                (d.business_request_id IS NULL AND u.account_verification_status = 'approved'
                    AND u.account_verification_reviewed_at < (NOW() - INTERVAL ? DAY))
                OR (d.business_request_id IS NOT NULL AND b.status = 'approved'
                    AND b.reviewed_at < (NOW() - INTERVAL ? DAY))
              )
            LIMIT ${BATCH_SIZE}`,
        params: (days) => [days, days]
    },
    {
        table: "kyc_upgrade_requests",
        sql: `SELECT id, file_url, file_public_id, file_resource_type, file_storage
            FROM kyc_upgrade_requests
            WHERE file_purged_at IS NULL
              AND (file_public_id IS NOT NULL OR file_url IS NOT NULL)
              AND status = 'approved' AND reviewed_at < (NOW() - INTERVAL ? DAY)
            LIMIT ${BATCH_SIZE}`,
        params: (days) => [days]
    }
];

exports.run = async () => {
    const days = await settingsService.getApprovedDocumentRetentionDays();
    if (!Number.isFinite(days) || days <= 0) return;

    let purged = 0;
    let failed = 0;

    for (const { table, sql, params } of DUE_QUERIES) {
        const [rows] = await db.query(sql, params(days));

        for (const doc of rows) {
            // The asset goes first. If deletion fails the row stays
            // unpurged and the next run tries again.
            const deleted = await deleteStoredDocument(doc);
            if (!deleted) {
                failed += 1;
                continue;
            }

            await db.query(
                `UPDATE ${table}
                SET file_purged_at = NOW(), file_url = NULL, file_public_id = NULL
                WHERE id = ? AND file_purged_at IS NULL`,
                [doc.id]
            );
            purged += 1;
        }
    }

    if (purged || failed) {
        logger.info({ purged, failed, days }, "document retention run finished");
    }
};
