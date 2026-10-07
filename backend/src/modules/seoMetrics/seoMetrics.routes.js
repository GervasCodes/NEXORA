const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const seoMetricsController = require("./seoMetrics.controller");
const { webVitalsValidation, searchMissValidation, adminListValidation } = require("./seoMetrics.validator");

// Public write endpoints: tight per-IP cap so they can't be used to fill
// the tables. A page reports at most five vitals; a handful of searches.
const reportLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many reports." }
});

router.post("/web-vitals", reportLimiter, webVitalsValidation, validationMiddleware, seoMetricsController.reportWebVital);
router.post("/search-misses", reportLimiter, searchMissValidation, validationMiddleware, seoMetricsController.reportSearchMiss);

router.get("/admin/search-misses", authMiddleware, authorize("admin"), adminListValidation, validationMiddleware, seoMetricsController.listSearchMisses);
router.get("/admin/web-vitals", authMiddleware, authorize("admin"), adminListValidation, validationMiddleware, seoMetricsController.summarizeVitals);

module.exports = router;
