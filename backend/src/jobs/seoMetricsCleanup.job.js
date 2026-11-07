// web_vitals_samples (migration 132) only needs recent data to judge
// Core Web Vitals trends; older rows just add table size - same reasoning
// as webhookReplayCleanup.job.js.

const seoMetricsService = require("../modules/seoMetrics/seoMetrics.service");
const logger = require("../utils/logger").child({ module: "job:seoMetricsCleanup" });

const RETENTION_DAYS = 90;

exports.run = async () => {
    const removed = await seoMetricsService.deleteOldVitals(RETENTION_DAYS);
    if (removed) {
        logger.info({ removed }, "removed old web vitals sample(s)");
    }
};
