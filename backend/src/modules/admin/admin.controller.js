const adminService = require("./admin.service");
const fraudService = require("../fraud/fraud.service");
const auditRepository = require("../audit/audit.repository");
const { EVENT_TYPE_GROUPS } = require("../audit/audit.constants");
const refundService = require("../refund/refund.service");

exports.listUsers = async (req, res) => {
    try {
        const users = await adminService.listUsers();

        return res.json({ success: true, data: users });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listDeletedUsers = async (req, res) => {
    try {
        const users = await adminService.listDeletedUsers();

        return res.json({ success: true, data: users });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Permanent Account Removal. Irreversible: erases the account's PII and
// deletes/scrubs its data per adminService.permanentlyDeleteUser's doc
// comment. Works directly on any account (active, suspended, or already
// self-deleted) as of Phase 1 of the Admin Account Control plan - only
// reachable by a super admin, see admin.routes.js. Mounted at both
// DELETE /admin/users/:id (direct, from the main Users list) and
// DELETE /admin/deleted-users/:id (from the Deleted Accounts review list).
exports.permanentlyDeleteUser = async (req, res) => {
    try {
        const { hardDeleted } = await adminService.permanentlyDeleteUser(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: hardDeleted
                ? "Account fully removed"
                : "Account permanently anonymized (order/review/financial history retained)",
            data: { hardDeleted }
        });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// Phase 1 (Admin Account Control) - replaces the old deactivate/activate
// toggle. Suspending requires a reason (validated in admin.validator.js);
// admin.service.js#suspendUser records it along with the acting admin and
// a timestamp, and login.service.js/auth.middleware.js block the account
// immediately, showing it the full-screen suspended page.
exports.suspendUser = async (req, res) => {
    try {
        await adminService.suspendUser(req.params.id, req.body.reason, req.user.id);

        return res.json({ success: true, message: "User suspended" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unsuspendUser = async (req, res) => {
    try {
        await adminService.unsuspendUser(req.params.id, req.user.id);

        return res.json({ success: true, message: "User unsuspended" });

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
        const result = await adminService.addAdmin(req.body, req.user.id);

        return res.status(201).json({ success: true, message: "Admin account created", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateAdminPermissions = async (req, res) => {
    try {
        await adminService.updateAdminPermissions(req.params.id, req.body.admin_level, req.user.id);

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
// Phase 5 - Audit Logs. `event_type` accepts either one specific event
// type (e.g. "account_suspended") or one of the grouped `category` names
// from audit.constants.js (e.g. "admin" for every admin-management event
// at once) - category takes precedence if both are somehow sent.
// `admin_actions_only=true` narrows to events whose actor is an
// admin/super_admin (suspensions, unsuspensions, deletions, permission
// changes, and admin logins), matching the Phase 5 requirement to be
// able to see admin logins/actions specifically. `q` is free text over
// the description, the actor's name/email, and the metadata JSON (so a
// target user id or a suspension reason both match).
exports.listAuditLogs = async (req, res) => {
    try {
        const { category, event_type, user_id, date_from, date_to, q, admin_actions_only, page, page_size } = req.query;

        let eventTypes;
        if (category && EVENT_TYPE_GROUPS[category]) {
            eventTypes = EVENT_TYPE_GROUPS[category];
        } else if (event_type) {
            eventTypes = [event_type];
        }

        const result = await auditRepository.search({
            eventTypes,
            userId: user_id ? Number(user_id) : undefined,
            dateFrom: date_from || undefined,
            dateTo: date_to || undefined,
            q,
            adminActorsOnly: admin_actions_only === "true",
            page: page ? Number(page) : undefined,
            pageSize: page_size ? Number(page_size) : undefined
        });

        return res.json({
            success: true,
            data: result.rows,
            meta: { total: result.total, page: result.page, totalPages: result.totalPages }
        });

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
