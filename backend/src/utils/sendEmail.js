const { sendTransactionalEmail } = require("../config/brevo");
const { textToHtml } = require("./emailTemplate");
const emailOutboxService = require("../modules/emailOutbox/emailOutbox.service");
const logger = require("./logger").child({ module: "sendEmail" });

// Best-effort email send for general notifications (order updates, etc).
// Still never throws into the feature that triggered it, but a failed send
// is no longer lost: it is parked in email_outbox and retried by
// emailRetry.job.js . OTP delivery does NOT go through here - a
// code that can't be sent is a request that failed, so otp.service.js calls
// the sender directly and reports the error.
// { retry: false } is for marketing sends (broadcasts): a failed one is
// logged and dropped rather than retried later.
//
// Returns true when the message was actually accepted by the provider
// (or simulated in non-production without BREVO_API_KEY - see
// config/brevo.js#sendTransactionalEmail), false whenever it was not.
// This return value matters to callers like broadcast.service.js that
// keep a "how many actually sent" counter - previously this function
// resolved with no value on both success AND on a caught, swallowed
// failure, so a caller awaiting it had no way to tell the two apart and
// ended up counting every attempt as a send regardless of outcome.
const sendEmail = async (to, subject, text, html, { retry = true } = {}) => {
    const finalHtml = html || textToHtml(text);

    try {
        await sendTransactionalEmail({ to, subject, text, html: finalHtml });
        return true;
    } catch (error) {
        if (!retry) {
            logger.warn({ err: error, to }, "failed to send email - not retried (marketing)");
            return false;
        }

        logger.warn({ err: error, to }, "failed to send email - queued for retry");

        try {
            await emailOutboxService.enqueue({ to, subject, text, html: finalHtml });
        } catch (queueError) {
            logger.error({ err: queueError, to }, "failed to queue email for retry");
        }

        // Still false: it wasn't delivered right now, only queued. Callers
        // that just want "did this land in an inbox this instant" (like a
        // broadcast's sent-count) should treat a queued retry the same as
        // not-yet-sent; notification.service.js's fire-and-forget caller
        // doesn't use the return value at all, so this doesn't change its
        // behaviour.
        return false;
    }
};

module.exports = sendEmail;
