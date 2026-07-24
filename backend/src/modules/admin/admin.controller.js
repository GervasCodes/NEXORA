const adminService = require("./admin.service");
const fraudService = require("../fraud/fraud.service");
const auditRepository = require("../audit/audit.repository");
const refundService = require("../refund/refund.service");

exports.listUsers = async (req, res) => {
    try {
        const users = await adminService.listUsers();

        return res.json({ success: true, data: users });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivateUser = async (req, res) => {
    try {
        await adminService.setUserActive(req.params.id, false);

        return res.json({ success: true, message: "User deactivated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateUser = async (req, res) => {
    try {
        await adminService.setUserActive(req.params.id, true);

        return res.json({ success: true, message: "User activated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listSellers = async (req, res) => {
    try {
        const sellers = await adminService.listSellers();

        return res.json({ success: true, data: sellers });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.verifySeller = async (req, res) => {
    try {
        await adminService.setSellerVerified(req.params.id, true);

        return res.json({ success: true, message: "Seller verified" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unverifySeller = async (req, res) => {
    try {
        await adminService.setSellerVerified(req.params.id, false);

        return res.json({ success: true, message: "Seller verification removed" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listProducts = async (req, res) => {
    try {
        const products = await adminService.listProducts();

        return res.json({ success: true, data: products });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivateProduct = async (req, res) => {
    try {
        await adminService.setProductActive(req.params.id, false);

        return res.json({ success: true, message: "Product deactivated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateProduct = async (req, res) => {
    try {
        await adminService.setProductActive(req.params.id, true);

        return res.json({ success: true, message: "Product activated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.sponsorProduct = async (req, res) => {
    try {
        await adminService.setProductSponsored(req.params.id, true);

        return res.json({ success: true, message: "Product sponsored" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unsponsorProduct = async (req, res) => {
    try {
        await adminService.setProductSponsored(req.params.id, false);

        return res.json({ success: true, message: "Product unsponsored" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listOrders = async (req, res) => {
    try {
        const orders = await adminService.listAllOrders();

        return res.json({ success: true, data: orders });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDispatchOverview = async (req, res) => {
    try {
        const overview = await adminService.getDispatchOverview();

        return res.json({ success: true, data: overview });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const stats = await adminService.getDashboard();

        return res.json({ success: true, data: stats });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const analytics = await adminService.getAnalytics();

        return res.json({ success: true, data: analytics });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Platform settings ---

exports.getSettings = async (req, res) => {
    try {
        const settings = await adminService.getSettings();

        return res.json({ success: true, data: settings });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const settings = await adminService.updateSettings(req.body);

        return res.json({ success: true, message: "Settings updated", data: settings });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listSponsorshipCampaigns = async (req, res) => {
    try {
        const campaigns = await adminService.listSponsorshipCampaigns();

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listFeaturedStoreCampaigns = async (req, res) => {
    try {
        const campaigns = await adminService.listFeaturedStoreCampaigns();

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listDepartmentSponsorshipCampaigns = async (req, res) => {
    try {
        const campaigns = await adminService.listDepartmentSponsorshipCampaigns();

        return res.json({ success: true, data: campaigns });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Seller withdrawal requests ---

exports.listWithdrawals = async (req, res) => {
    try {
        const withdrawals = await adminService.listWithdrawals();

        return res.json({ success: true, data: withdrawals });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const result = await adminService.approveWithdrawal(req.params.id, req.body.admin_note);

        return res.json({ success: true, message: "Withdrawal approved", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const result = await adminService.rejectWithdrawal(req.params.id, req.body.admin_note);

        return res.json({ success: true, message: "Withdrawal rejected and refunded", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markWithdrawalPaid = async (req, res) => {
    try {
        const result = await adminService.markWithdrawalPaid(req.params.id, req.body.admin_note);

        return res.json({ success: true, message: "Withdrawal marked as paid", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Escrow manual release (Phase 9D) ---

exports.releaseOrderEscrow = async (req, res) => {
    try {
        const result = await adminService.releaseOrderEscrow(req.params.id);

        return res.json({ success: true, message: "Held earnings released for this order", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Old seller document-verification review actions lived here
// (listPendingVerifications / getVerificationDocuments /
// approveVerification / rejectVerification) - removed; see
// accountVerification module for the centralized replacement.

// --- Admin management (super admin only) ---

exports.listAdmins = async (req, res) => {
    try {
        const admins = await adminService.listAdmins();

        return res.json({ success: true, data: admins });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.createAdmin = async (req, res) => {
    try {
        const result = await adminService.addAdmin(req.body);

        return res.status(201).json({ success: true, message: "Admin account created", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateAdminPermissions = async (req, res) => {
    try {
        await adminService.updateAdminPermissions(req.params.id, req.body.admin_level);

        return res.json({ success: true, message: "Admin permissions updated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.removeAdmin = async (req, res) => {
    try {
        await adminService.removeAdmin(req.params.id, req.user.id);

        return res.json({ success: true, message: "Admin access removed" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listFraudFlags = async (req, res) => {
    try {
        const flags = await fraudService.listOpenFlags();

        return res.json({ success: true, data: flags });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// ---- Refunds (Phase 2 - Refund Automation) -----------------------------
// Automatic refunds are triggered by dispute.service.js when a dispute
// is resolved in the buyer's favor; these endpoints are for triage of
// ones that need attention ('failed' / 'manual_required') and for
// manually retrying a failed automatic attempt.

exports.listRefunds = async (req, res) => {
    try {
        const { status, limit } = req.query;

        // No status filter -> default to only what needs an admin's
        // attention, since 'completed'/'pending' don't need triage.
        const statusFilter = status
            ? String(status).split(",")
            : ["failed", "manual_required", "processing"];

        const refunds = await refundService.listRefunds({
            status: statusFilter,
            limit: limit ? Number(limit) : undefined
        });

        return res.json({ success: true, data: refunds });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getRefund = async (req, res) => {
    try {
        const refund = await refundService.getRefund(req.params.id);
        if (!refund) {
            return res.status(404).json({ success: false, message: "Refund not found" });
        }
        return res.json({ success: true, data: refund });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.retryRefund = async (req, res) => {
    try {
        const result = await refundService.retryRefund(req.params.id, req.user.id);
        return res.json({ success: true, data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Read-only view over audit_logs (SRS 3.10) - lets an admin check recent
// logins, failed logins, registrations, orders, and payments for
// troubleshooting/security review without needing direct DB access.
// Optional ?event_type= / ?user_id= / ?limit= query filters.
exports.listAuditLogs = async (req, res) => {
    try {
        const { event_type, user_id, limit } = req.query;

        const logs = await auditRepository.findRecent({
            eventType: event_type,
            userId: user_id ? Number(user_id) : undefined,
            limit: limit ? Number(limit) : undefined
        });

        return res.json({ success: true, data: logs });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.resolveFraudFlag = async (req, res) => {
    try {
        await fraudService.resolveFlag(req.params.id, req.body.status, req.user.id);

        return res.json({ success: true, message: "Flag updated." });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
