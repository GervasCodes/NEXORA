const seoMetricsService = require("./seoMetrics.service");

// Both public endpoints are fire-and-forget from the browser: they always
// answer 204 so a metrics hiccup can never surface to a shopper.
exports.reportWebVital = async (req, res) => {
    try {
        await seoMetricsService.recordVital(req.body);
    } catch (error) {
        console.error("web vital write failed:", error.message);
    }
    return res.status(204).end();
};

exports.reportSearchMiss = async (req, res) => {
    try {
        await seoMetricsService.recordSearchMiss(req.body);
    } catch (error) {
        console.error("search miss write failed:", error.message);
    }
    return res.status(204).end();
};

exports.listSearchMisses = async (req, res) => {
    try {
        const data = await seoMetricsService.listSearchMisses(Number(req.query.limit) || 100);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.summarizeVitals = async (req, res) => {
    try {
        const data = await seoMetricsService.summarizeVitals(Number(req.query.days) || 7);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
