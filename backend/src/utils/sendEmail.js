const { sendTransactionalEmail } = require("../config/brevo");
const { textToHtml } = require("./emailTemplate");
const emailOutboxService = require("../modules/emailOutbox/emailOutbox.service");
const logger = require("./logger").child({ module: "sendEmail" });

// Best-effort email send for general notifications (order updates, etc).
// Still never throws into the feature that triggered it, but a failed send
// is no longer lost: it is parked in email_outbox and retried by
// emailRetry.job.js (Phase 9). OTP delivery does NOT go through here - a
// code that can't be sent is a request that failed, so otp.service.js calls
// the sender directly and reports the error.
// { retry: false } is for marketing sends (broadcasts): a failed one is
// logged and dropped rather than retried later.
const sendEmail = async (to, subject, text, html, { retry = true } = {}) => {
    const finalHtml = html || textToHtml(text);

    try {
        await sendTransactionalEmail({ to, subject, text, html: finalHtml });
    } catch (error) {
        if (!retry) {
            logger.warn({ err: error, to }, "failed to send email - not retried (marketing)");
            return;
        }

        logger.warn({ err: error, to }, "failed to send email - queued for retry");

        try {
            await emailOutboxService.enqueue({ to, subject, text, html: finalHtml });
        } catch (queueError) {
            logger.error({ err: queueError, to }, "failed to queue email for retry");
        }
    }
};

module.exports = sendEmail;
