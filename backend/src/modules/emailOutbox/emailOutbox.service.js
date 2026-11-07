const emailOutboxRepository = require("./emailOutbox.repository");
const { sendTransactionalEmail } = require("../../config/brevo");
const logger = require("../../utils/logger").child({ module: "emailOutbox" });
const Sentry = require("../../config/sentry");

// Sends tried before a message is marked failed for good and shown on the
// admin dashboard.
const MAX_ATTEMPTS = 5;

// Wait before the next try: 2, 4, 8, 16 minutes.
const backoffMinutes = (attemptsSoFar) => 2 ** attemptsSoFar;

exports.enqueue = (message) => emailOutboxRepository.insert(message);

// Processes one batch of due messages. Runs under the job advisory lock
// (see jobs/index.js safeRun), so two replicas never send the same row.
exports.processDue = async (batchSize = 25) => {
    const rows = await emailOutboxRepository.findDue(batchSize);
    const counts = { sent: 0, retrying: 0, failed: 0 };

    for (const row of rows) {
        const attempts = row.attempts + 1;

        try {
            await sendTransactionalEmail({
                to: row.to_email,
                subject: row.subject,
                text: row.text_body,
                html: row.html_body || undefined
            });
            await emailOutboxRepository.markSent(row.id, attempts);
            counts.sent += 1;
        } catch (error) {
            const message = String(error?.message || error).slice(0, 500);

            if (attempts >= MAX_ATTEMPTS) {
                await emailOutboxRepository.markFailed(row.id, attempts, message);
                counts.failed += 1;
                logger.error({ err: error, emailId: row.id }, "email gave up after max attempts");
                Sentry.captureException(error, { tags: { area: "email", stage: "retry-exhausted" } });
            } else {
                await emailOutboxRepository.markRetry(row.id, attempts, message, backoffMinutes(attempts));
                counts.retrying += 1;
            }
        }
    }

    return counts;
};

exports.countFailed = () => emailOutboxRepository.countFailed();
