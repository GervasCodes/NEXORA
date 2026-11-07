const refundService = require("./refund.service");

// Admin refund queue (Phase 5) - previously refund.service.js's
// listRefunds/retryRefund/getRefund existed but had no HTTP route at
// all, so "failed refunds appear in an admin queue" had nothing to
// render: an admin could only find out about a failed refund by reading
// Sentry/logs. ?status=failed,manual_required is the "needs attention"
// queue; omitting status returns everything, newest first.
exports.list = async (req, res) => {
    try {
        const status = req.query.status ? String(req.query.status).split(",") : undefined;
        const refunds = await refundService.listRefunds({ status, limit: req.query.limit });
        res.json({ success: true, data: refunds });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Badge count for the admin nav (failed + manual_required - the two
// statuses that need a human to act on them; pending/processing are
// just mid-flight).
exports.needsAttentionCount = async (req, res) => {
    try {
        const refunds = await refundService.listRefunds({ status: ["failed", "manual_required"], limit: 500 });
        res.json({ success: true, data: { count: refunds.length } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getOne = async (req, res) => {
    try {
        const refund = await refundService.getRefund(req.params.id);
        if (!refund) return res.status(404).json({ success: false, message: "Refund not found" });
        res.json({ success: true, data: refund });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.retry = async (req, res) => {
    try {
        const result = await refundService.retryRefund(req.params.id, req.user.id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
