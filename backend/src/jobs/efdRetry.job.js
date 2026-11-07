/**
 * EFD retry (Phase 5, P1).
 *
 * Re-submits fiscal receipts stuck 'failed' or 'pending' (capped by
 * retry_count so a permanently-broken one doesn't retry forever), and
 * retries credit notes stuck 'pending' (a credit-note submission that
 * started but never resolved to issued/failed).
 */

const efdRepository = require("../modules/efd/efd.repository");
const efdService = require("../modules/efd/efd.service");
const orderRepository = require("../modules/order/order.repository");
const efdProvider = require("../modules/efd/providers/efd.provider");
const Sentry = require("../config/sentry");
const logger = require("../utils/logger").child({ module: "job:efdRetry" });

const MAX_RETRIES = 5;

exports.run = async () => {
    const retryable = await efdRepository.findRetryable(MAX_RETRIES);
    let receiptsRetried = 0;

    for (const row of retryable) {
        try {
            await efdService.retryReceiptRow(row);
            receiptsRetried += 1;
        } catch (err) {
            logger.error({ err, receiptId: row.id }, "EFD receipt retry error");
            Sentry.captureException(err, { tags: { area: "efd", stage: "retry-job" }, extra: { receiptId: row.id } });
        }
    }

    const pendingCreditNotes = await efdRepository.findPendingCreditNotes();
    let creditNotesRetried = 0;

    for (const row of pendingCreditNotes) {
        try {
            const order = await orderRepository.findOrderById(row.order_id);
            const result = await efdProvider.submitCreditNote({
                fiscalReceiptNumber: row.fiscal_receipt_number,
                verificationCode: row.verification_code,
                orderNumber: order?.order_number,
                reason: "retry"
            });
            await efdRepository.setCreditNoteStatus(row.id, result.success ? "issued" : "failed");
            creditNotesRetried += 1;
        } catch (err) {
            await efdRepository.setCreditNoteStatus(row.id, "failed").catch(() => {});
            logger.error({ err, receiptId: row.id }, "EFD credit note retry error");
            Sentry.captureException(err, { tags: { area: "efd", stage: "credit-note-retry-job" }, extra: { receiptId: row.id } });
        }
    }

    if (retryable.length || pendingCreditNotes.length) {
        logger.info({ receiptsRetried, creditNotesRetried }, "EFD retry sweep");
    }
};
