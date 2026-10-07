// Retries notification emails that failed to send (see email_outbox,
// migration 131). Failures are kept with backoff and only marked failed
// after the final attempt, which is what the admin dashboard counts.

const logger = require("../utils/logger").child({ module: "job:emailRetry" });
const emailOutboxService = require("../modules/emailOutbox/emailOutbox.service");

exports.run = async () => {
    const counts = await emailOutboxService.processDue();

    if (counts.sent || counts.retrying || counts.failed) {
        logger.info(counts, "email retry pass complete");
    }
};
