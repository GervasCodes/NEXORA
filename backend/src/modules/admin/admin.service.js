const db = require("../../config/db");
const adminRepository = require("./admin.repository");
const notificationService = require("../notification/notification.service");
const settingsService = require("../settings/settings.service");
const walletService = require("../wallet/wallet.service");
const sponsorshipService = require("../sponsorship/sponsorship.service");
const featuredStoreService = require("../featuredStore/featuredStore.service");
const departmentSponsorshipService = require("../departmentSponsorship/departmentSponsorship.service");
const auditService = require("../audit/audit.service");
const adminNotificationService = require("../adminNotification/adminNotification.service");
const accountRepository = require("../account/account.repository");
const { deleteManyFromCloudinary } = require("../../utils/cloudinaryDelete");

exports.listUsers = async () => {
    return adminRepository.findAllUsers();
};

// Phase 3 - Deleted Accounts section. permanentlyDeleteUser below (Phase
// 4) is what an admin calls from here to actually erase one.
exports.listDeletedUsers = async () => {
    return adminRepository.findAllDeletedUsers();
};

// Phase 4 - Permanent Account Removal.
//
// Runs against an account that already went through Phase 3's soft
// delete (deleted_at set). Erases every identifying field, deletes
// whatever data/documents/Cloudinary assets are safe to remove outright,
// and leaves the users row itself as a permanently-anonymized tombstone
// - see migration 057 and admin.repository.js's "Permanent Account
// Removal" section for the full reasoning on why the row can't just be
// dropped (orders/reviews/disputes/etc. reference it without cascade).
//
// What this deletes entirely (DB rows + Cloudinary assets):
//   - account_verification_documents (ID photos, business registration)
//   - products that were never actually ordered, and their images/
//     videos/audio (a product with real order history is left alone -
//     see findNeverOrderedProductIds)
//   - seller_profiles' logo/banner images (row itself is scrubbed, not
//     dropped - see scrubSellerProfile)
//   - wishlist_items, otp_codes, notifications, seller_collections,
//     seller_delivery_agents links, delivery_offers (as agent) - all
//     purely personal/operational bookkeeping with no other party
//     depending on them
// What this scrubs but keeps (financial/legal record, or another
// party's data depends on it):
//   - orders, order_items, payments, wallet_transactions,
//     withdrawal_requests, agent_earnings, disputes + evidence/messages,
//     reviews + review_photos, delivery_ratings, audit_logs, fraud_flags,
//     sponsorship/featured-store/department-sponsorship campaigns
//   - conversations (kept for the other participant); the deleted
//     account's own messages are tombstoned via the existing "delete
//     message" mechanism (is_deleted/deleted_at), not removed
//   - the users row and seller_profiles row (PII scrubbed, not dropped)
exports.permanentlyDeleteUser = async (userId, actorAdminId) => {
    const user = await adminRepository.findUserForPermanentDeletion(userId);

    if (!user) {
        throw new Error("User not found");
    }

    // Used to require deleted_at (the user had already soft-deleted their
    // own account first). Phase 1 of the Admin Account Control plan lifts
    // that precondition - Suspend/Unsuspend and Permanent Delete are now
    // both directly available admin levers, independent of whether the
    // user ever self-deleted. Self-deleted accounts (Deleted Accounts
    // section) can still be permanently removed the same way as before.
    if (Number(userId) === Number(actorAdminId)) {
        throw new Error("You can't permanently delete your own account.");
    }

    if (user.permanently_deleted_at) {
        throw new Error("This account has already been permanently deleted.");
    }

    // Gather every Cloudinary asset URL up front, before anything is
    // deleted from the database - once the account_verification_documents
    // /product rows are gone, there's no way to look their URLs back up.
    const verificationDocUrls = await adminRepository.findAccountVerificationDocumentUrls(userId);

    const sellerAssets = await adminRepository.findSellerLogoAndBanner(userId);
    const sellerAssetUrls = sellerAssets
        ? [sellerAssets.store_logo, sellerAssets.store_banner].filter(Boolean)
        : [];

    const neverOrderedProductIds = await adminRepository.findNeverOrderedProductIds(userId);
    const productMediaUrls = await adminRepository.findProductMediaUrls(neverOrderedProductIds);

    const connection = await db.getConnection();
    let hardDeleted = false;

    try {
        await connection.beginTransaction();

        await adminRepository.deleteAccountVerificationDocuments(userId, connection);

        await adminRepository.deleteProducts(neverOrderedProductIds, connection);
        await adminRepository.deleteSellerCollections(userId, connection);

        // Previously guaranteed by the self-delete step (Phase 3) that used
        // to be a precondition for this action. Now that an admin can
        // permanently delete an account directly, this step has to do that
        // cleanup itself instead of assuming it already happened.
        await accountRepository.deleteCartItems(userId, connection);
        await accountRepository.deletePushSubscriptions(userId, connection);
        await accountRepository.deactivateSellerListings(userId, connection);

        await adminRepository.deleteWishlistItems(userId, connection);
        await adminRepository.deleteOtpCodes(userId, connection);
        await adminRepository.deleteNotifications(userId, connection);
        await adminRepository.deleteSellerDeliveryAgentLinks(userId, connection);
        await adminRepository.deleteDeliveryOffersForAgent(userId, connection);
        await adminRepository.tombstoneSentMessages(userId, connection);

        // Everything above was always safe to remove outright regardless
        // of the account's history. What's left pointing at this row
        // without ON DELETE CASCADE - orders, order_items (as seller),
        // payments, reviews, disputes, refunds, delivery_ratings,
        // deliveries (as agent), wallet/withdrawal/earnings history,
        // sponsorship-style campaigns, conversations/messages (as
        // sender, even tombstoned) - is exactly the financial/legal/
        // other-party record set migration 057 documents. Rather than
        // re-deriving that table list by hand (and risking missing one),
        // ask MySQL directly: try an actual `DELETE FROM users`, inside a
        // SAVEPOINT so a blocked delete rolls back to exactly this point
        // without losing the cleanup already done above. If it succeeds,
        // the account (and, via ON DELETE CASCADE, its seller_profiles
        // row) is genuinely gone - true full removal, not a tombstone.
        hardDeleted = await adminRepository.attemptHardDeleteUser(userId, connection);

        if (!hardDeleted) {
            // Blocked - this account has real order/review/dispute/
            // financial/message history other people's records depend
            // on, so the row has to survive as an anonymized tombstone
            // instead (see admin.repository.js#scrubUserPII, which also
            // sets is_active = FALSE and deleted_at so the account stops
            // showing up as "Active" in the regular Users list).
            if (sellerAssets) {
                await adminRepository.scrubSellerProfile(userId, connection);
            }

            await adminRepository.scrubUserPII(userId, connection);
        }

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }

    // Cloudinary cleanup happens after the transaction commits, not
    // inside it - Cloudinary isn't transactional, and the DB state (the
    // part that actually matters for correctness/re-running this safely)
    // is already durably erased at this point. Best-effort: a leftover
    // asset from a failed delete is logged, not fatal - see
    // cloudinaryDelete.js.
    const failedDeletes = await deleteManyFromCloudinary([
        ...verificationDocUrls,
        ...sellerAssetUrls,
        ...productMediaUrls
    ]);

    auditService.log({
        userId: actorAdminId,
        eventType: "account_permanently_deleted",
        description: `Admin permanently deleted account #${userId}${hardDeleted ? " (fully removed)" : " (anonymized - order/review/financial history retained)"}`,
        metadata: {
            target_user_id: Number(userId),
            role: user.role,
            hard_deleted: hardDeleted,
            products_deleted: neverOrderedProductIds.length,
            cloudinary_assets_deleted:
                verificationDocUrls.length + sellerAssetUrls.length + productMediaUrls.length - failedDeletes.length,
            cloudinary_assets_failed: failedDeletes.length
        }
    });

    // "admin" here means the target account HAD the admin role - not to
    // be confused with removeAdmin below, which only revokes admin
    // access without erasing the account. A permanently-deleted admin
    // account is rare enough (and severe enough) to warrant its own
    // event type and a higher severity than an ordinary user's.
    adminNotificationService.notify({
        type: user.role === "admin" ? "admin_account_permanently_deleted" : "user_account_permanently_deleted",
        category: "account",
        severity: user.role === "admin" ? "critical" : "warning",
        title: user.role === "admin" ? "Admin account permanently deleted" : "Account permanently deleted",
        message: `${user.first_name} ${user.last_name} (${user.email}, ${user.role}) was permanently deleted by an admin${hardDeleted ? "" : " (order/review history retained; account anonymized)"}.`,
        metadata: { role: user.role, target_user_id: Number(userId), hard_deleted: hardDeleted },
        relatedUserId: userId
    });

    if (failedDeletes.length) {
        console.error(
            `[admin] permanentlyDeleteUser(${userId}): ${failedDeletes.length} Cloudinary asset(s) failed to delete`,
            failedDeletes
        );
    }

    return { hardDeleted };
};

// Suspend/Unsuspend (Phase 1 of the Admin Account Control plan) - replaces
// the old bare setUserActive toggle. A suspension always records who did
// it and why (migration 058), and is fully reversible; permanentlyDeleteUser
// below is the separate, irreversible lever.
exports.suspendUser = async (userId, reason, adminId) => {
    const user = await adminRepository.findUserById(userId);

    if (!user) {
        throw new Error("User not found");
    }

    // A self-deleted account (deleted_at set) is not reachable through this
    // lever - it never shows up in the regular Users list this action is
    // called from anyway (see findAllUsers), but the guard stays here too
    // in case it's ever called directly.
    if (user.deleted_at) {
        throw new Error("This account has been deleted and can't be suspended.");
    }

    if (Number(userId) === Number(adminId)) {
        throw new Error("You can't suspend your own account.");
    }

    if (!reason || !reason.trim()) {
        throw new Error("A suspension reason is required.");
    }

    await adminRepository.suspendUser(userId, reason.trim(), adminId);

    await notificationService.notify({
        userId,
        type: "account_status",
        titleKey: "notifications.account.suspended.title",
        messageKey: "notifications.account.suspended.message",
        messageParams: { reason: reason.trim() },
        withEmail: true
    });

    auditService.log({
        userId: adminId,
        eventType: "account_suspended",
        description: `Admin suspended account #${userId}`,
        metadata: { target_user_id: Number(userId), reason: reason.trim() }
    });

    adminNotificationService.notify({
        type: "account_suspended",
        category: "account",
        severity: "warning",
        title: "Account suspended",
        message: `${user.first_name} ${user.last_name} (${user.email}) was suspended. Reason: ${reason.trim()}`,
        metadata: { target_user_id: Number(userId), reason: reason.trim() },
        relatedUserId: userId
    });
};

exports.unsuspendUser = async (userId, adminId) => {
    const user = await adminRepository.findUserById(userId);

    if (!user) {
        throw new Error("User not found");
    }

    if (!user.suspended_at) {
        throw new Error("This account is not currently suspended.");
    }

    await adminRepository.unsuspendUser(userId);

    await notificationService.notify({
        userId,
        type: "account_status",
        titleKey: "notifications.account.unsuspended.title",
        messageKey: "notifications.account.unsuspended.message",
        withEmail: true
    });

    auditService.log({
        userId: adminId,
        eventType: "account_unsuspended",
        description: `Admin unsuspended account #${userId}`,
        metadata: { target_user_id: Number(userId) }
    });

    adminNotificationService.notify({
        type: "account_unsuspended",
        category: "account",
        severity: "info",
        title: "Account unsuspended",
        message: `${user.first_name} ${user.last_name} (${user.email}) was unsuspended.`,
        metadata: { target_user_id: Number(userId) },
        relatedUserId: userId
    });
};

exports.listSellers = async () => {
    return adminRepository.findAllSellers();
};

exports.setSellerVerified = async (sellerUserId, isVerified) => {
    const profile = await adminRepository.findSellerProfileByUserId(sellerUserId);

    if (!profile) {
        throw new Error("Seller profile not found");
    }

    await adminRepository.setSellerVerified(sellerUserId, isVerified);

    await notificationService.notify({
        userId: sellerUserId,
        type: "seller_verification",
        titleKey: isVerified ? "notifications.seller.storeVerified.title" : "notifications.seller.storeUnverified.title",
        messageKey: isVerified ? "notifications.seller.storeVerified.message" : "notifications.seller.storeUnverified.message",
        messageParams: { storeName: profile.store_name },
        withEmail: true
    });
};

exports.listProducts = async () => {
    return adminRepository.findAllProducts();
};

exports.setProductActive = async (productId, isActive) => {
    const product = await adminRepository.findProductById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    await adminRepository.setProductActive(productId, isActive);

    await notificationService.notify({
        userId: product.seller_id,
        type: "product_moderation",
        titleKey: isActive ? "notifications.product.reactivated.title" : "notifications.product.removed.title",
        messageKey: isActive ? "notifications.product.reactivated.message" : "notifications.product.removed.message",
        messageParams: { productName: product.name },
        withEmail: true
    });
};

exports.setProductSponsored = async (productId, isSponsored) => {
    const product = await adminRepository.findProductById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    await adminRepository.setProductSponsored(productId, isSponsored);
};

exports.listAllOrders = async () => {
    return adminRepository.findAllOrders();
};

// --- Dispatch dashboard (Phase 6) ---
//
// One combined read for the admin dispatch board: every in-flight
// delivery (with a computed delay flag - see admin.repository's
// findActiveDeliveries), every online agent (idle or busy), and a
// summary count block so the frontend doesn't need to derive totals
// itself. The socket layer (delivery.service.js / socket.js) pushes
// live updates into the "admins" room on top of this initial snapshot -
// see docs/API.md for the event list.
exports.getDispatchOverview = async () => {
    const [deliveries, agents] = await Promise.all([
        adminRepository.findActiveDeliveries(),
        adminRepository.findOnlineAgents()
    ]);

    const normalizedDeliveries = deliveries.map((d) => ({
        ...d,
        is_delayed: !!d.is_delayed
    }));

    const delayed = normalizedDeliveries.filter((d) => d.is_delayed);

    return {
        deliveries: normalizedDeliveries,
        agents,
        delayed,
        summary: {
            active_deliveries: normalizedDeliveries.length,
            delayed_deliveries: delayed.length,
            online_agents: agents.length,
            idle_agents: agents.filter((a) => Number(a.active_delivery_count) === 0).length
        }
    };
};

exports.getDashboard = async () => {
    const { userCounts, orderCounts, revenue, productCounts, bookingCounts, bookingRevenue, serviceCounts } =
        await adminRepository.getDashboardStats();

    return {
        users: {
            buyers: Number(userCounts.buyers) || 0,
            sellers: Number(userCounts.sellers) || 0,
            delivery_agents: Number(userCounts.delivery_agents) || 0
        },
        orders: {
            total: Number(orderCounts.total_orders) || 0,
            pending: Number(orderCounts.pending_orders) || 0,
            delivered: Number(orderCounts.delivered_orders) || 0,
            cancelled: Number(orderCounts.cancelled_orders) || 0
        },
        revenue: Number(revenue.total_revenue) || 0,
        products: {
            total: Number(productCounts.total_products) || 0,
            active: Number(productCounts.active_products) || 0
        },
        // Phase 5 (Growth) - marketplace insights: the services
        // counterpart of orders/products/revenue above.
        bookings: {
            total: Number(bookingCounts.total_bookings) || 0,
            pending: Number(bookingCounts.pending_bookings) || 0,
            completed: Number(bookingCounts.completed_bookings) || 0,
            cancelled: Number(bookingCounts.cancelled_bookings) || 0
        },
        bookingRevenue: Number(bookingRevenue.total_booking_revenue) || 0,
        services: {
            total: Number(serviceCounts.total_services) || 0,
            active: Number(serviceCounts.active_services) || 0
        }
    };
};

// --- Platform settings (commission rate, rider delivery fee) ---

exports.getAnalytics = async () => {
    const DAYS = 14;
    const FORECAST_DAYS = 7;
    const REGRESSION_WINDOW_DAYS = 30;

    const [dailyRows, regressionRows, topProducts, topSellers] = await Promise.all([
        adminRepository.getDailySales(DAYS),
        adminRepository.getDailySales(REGRESSION_WINDOW_DAYS),
        adminRepository.getTopProducts(5),
        adminRepository.getTopSellers(5)
    ]);

    // Fill in days with zero sales so the chart doesn't have gaps or
    // misleadingly compress into however many days actually had orders.
    const byDay = new Map(dailyRows.map((r) => [
        new Date(r.day).toISOString().slice(0, 10),
        { revenue: Number(r.revenue) || 0, order_count: Number(r.order_count) || 0 }
    ]));

    const dailySales = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        const entry = byDay.get(key) || { revenue: 0, order_count: 0 };
        dailySales.push({
            day: key,
            label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            ...entry
        });
    }

    const forecast = forecastRevenue(regressionRows, REGRESSION_WINDOW_DAYS, FORECAST_DAYS);

    return {
        dailySales,
        forecast,
        topProducts: topProducts.map((p) => ({
            ...p,
            units_sold: Number(p.units_sold) || 0,
            revenue: Number(p.revenue) || 0
        })),
        topSellers: topSellers.map((s) => ({
            ...s,
            revenue: Number(s.revenue) || 0,
            order_count: Number(s.order_count) || 0
        }))
    };
};

// Phase 5 (Growth) - Analytics + Advanced Reporting. Services
// counterpart of getAnalytics above, same daily-sales/forecast/top-N
// shape, reusing forecastRevenue as-is (it only cares about a row's
// day/revenue fields, nothing product-specific) plus a
// category-performance breakdown that getAnalytics has no product
// equivalent of yet (categories weren't a natural revenue grouping for
// products the way "which category of services earns the most" is a
// question sellers/admins actually ask about a growing services catalog).
exports.getServicesAnalytics = async () => {
    const DAYS = 14;
    const FORECAST_DAYS = 7;
    const REGRESSION_WINDOW_DAYS = 30;

    const [dailyRows, regressionRows, topServices, topProviders, categoryPerformance] = await Promise.all([
        adminRepository.getDailyBookingSales(DAYS),
        adminRepository.getDailyBookingSales(REGRESSION_WINDOW_DAYS),
        adminRepository.getTopServices(5),
        adminRepository.getTopProviders(5),
        adminRepository.getCategoryPerformance()
    ]);

    const byDay = new Map(dailyRows.map((r) => [
        new Date(r.day).toISOString().slice(0, 10),
        { revenue: Number(r.revenue) || 0, booking_count: Number(r.booking_count) || 0 }
    ]));

    const dailyBookingSales = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        const entry = byDay.get(key) || { revenue: 0, booking_count: 0 };
        dailyBookingSales.push({
            day: key,
            label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            ...entry
        });
    }

    const forecast = forecastRevenue(regressionRows, REGRESSION_WINDOW_DAYS, FORECAST_DAYS);

    return {
        dailyBookingSales,
        forecast,
        topServices: topServices.map((s) => ({
            ...s,
            booking_count: Number(s.booking_count) || 0,
            revenue: Number(s.revenue) || 0
        })),
        topProviders: topProviders.map((p) => ({
            ...p,
            revenue: Number(p.revenue) || 0,
            booking_count: Number(p.booking_count) || 0
        })),
        categoryPerformance: categoryPerformance.map((c) => ({
            ...c,
            booking_count: Number(c.booking_count) || 0,
            revenue: Number(c.revenue) || 0
        }))
    };
};

// Ordinary least-squares linear regression on daily revenue over the
// trailing window, projected forward. Deliberately not anything fancier
// (no seasonality modeling, no external forecasting service) - a straight
// trend line over 30 days is honest about being a rough estimate, which
// is the right amount of confidence to project for a platform this size,
// versus a "smarter" model that would just be overfitting noise.
function forecastRevenue(rows, windowDays, forecastDays) {
    const byDay = new Map(rows.map((r) => [
        new Date(r.day).toISOString().slice(0, 10),
        Number(r.revenue) || 0
    ]));

    // x = day index (0..windowDays-1), y = revenue that day
    const points = [];
    for (let i = windowDays - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        points.push({ x: windowDays - 1 - i, y: byDay.get(key) || 0 });
    }

    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

    const denominator = n * sumXX - sumX * sumX;
    // Flat history (or all-zero) - denominator is 0, fall back to a flat
    // projection at the historical average rather than dividing by zero.
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const projected = [];
    for (let i = 0; i < forecastDays; i++) {
        const x = n + i;
        const date = new Date();
        date.setDate(date.getDate() + i + 1);
        projected.push({
            day: date.toISOString().slice(0, 10),
            label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            revenue: Math.max(0, Math.round(intercept + slope * x))
        });
    }

    return projected;
}

exports.getSettings = async () => {
    return settingsService.getAll();
};

exports.updateSettings = async (data) => {
    return settingsService.updateSettings(data);
};

// --- Sponsorship campaigns (Phase 8A - read-only oversight; the manual
// sponsor/unsponsor toggle above stays the separate, free lever for
// admin curation) ---
exports.listSponsorshipCampaigns = async () => {
    return sponsorshipService.listAllCampaigns();
};

// --- Featured store campaigns (Phase 8B - read-only oversight; there is
// no manual free toggle equivalent here, since a store's featured
// placement is scoped per department and derived live from this table -
// see category.repository.js#findFeaturedStoresByCategory) ---
exports.listFeaturedStoreCampaigns = async () => {
    return featuredStoreService.listAllCampaigns();
};

// --- Department sponsorship campaigns (Phase 8C - read-only oversight;
// same reasoning as Featured Stores above - a department's homepage
// placement is derived live from this table, see
// category.repository.js#findAllActiveWithSponsorship) ---
exports.listDepartmentSponsorshipCampaigns = async () => {
    return departmentSponsorshipService.listAllCampaigns();
};

// --- Seller withdrawal requests ---

exports.listWithdrawals = async () => {
    return walletService.listAllWithdrawals();
};

exports.approveWithdrawal = async (withdrawalId, adminNote) => {
    return walletService.processWithdrawal(withdrawalId, "approve", adminNote);
};

exports.rejectWithdrawal = async (withdrawalId, adminNote) => {
    return walletService.processWithdrawal(withdrawalId, "reject", adminNote);
};

exports.markWithdrawalPaid = async (withdrawalId, adminNote) => {
    return walletService.processWithdrawal(withdrawalId, "paid", adminNote);
};

// --- Escrow manual release (Phase 9D - docs/ESCROW_ANALYSIS.md section
// 3.4). Bypasses the normal delivered + escrow_hold_days timing gate for
// one order (e.g. a buyer has confirmed receipt, or an admin wants to
// close out a stale/edge-case order), but still respects the same
// dispute-freeze rule the scheduled release job uses - see
// walletService.releaseOrderEarnings. ---

exports.releaseOrderEscrow = async (orderId) => {
    return walletService.releaseOrderEarnings(orderId);
};

// Booking equivalent (Phase 3 - Financial Integration) - same manual
// bypass of the completed + escrow_hold_days timing gate, for one
// booking's held provider earnings. No dispute-freeze rule to respect
// here (see migration 064's design notes - bookings have no dispute
// system yet), so this is a straight release.
exports.releaseBookingEscrow = async (bookingId) => {
    return walletService.releaseBookingEarnings(bookingId);
};

// Old seller document-verification review methods lived here
// (listPendingVerifications / getSellerVerificationDetail /
// approveSellerVerification / rejectSellerVerification) - removed; see
// accountVerification module for the centralized replacement, which now
// also triggers the paid-badge resync previously done here (see
// accountVerification.service's approve()).

// --- Admin management (super admin only) ---

exports.listAdmins = async () => {
    return adminRepository.findAllAdmins();
};

exports.addAdmin = async (data, actorAdminId) => {
    const authRepository = require("../auth/auth.repository");
    const hashPassword = require("../../utils/hashPassword");

    const { first_name, last_name, email, phone, password, admin_level } = data;

    if (await authRepository.findByEmail(email)) {
        throw new Error("Email already exists");
    }
    if (await authRepository.findByPhone(phone)) {
        throw new Error("Phone number already exists");
    }

    const hashedPassword = await hashPassword(password);
    const resolvedLevel = admin_level === "super_admin" ? "super_admin" : "admin";

    const userId = await adminRepository.createAdmin({
        first_name,
        last_name,
        email,
        phone,
        password: hashedPassword,
        admin_level: resolvedLevel
    });

    // Phase 5 (Audit Logs) - a new admin account is itself a permission
    // grant, so it's tracked the same way as updateAdminPermissions below
    // rather than being lumped in with ordinary user_registered events.
    auditService.log({
        userId: actorAdminId,
        eventType: "admin_account_created",
        description: `Admin created a new ${resolvedLevel === "super_admin" ? "super admin" : "admin"} account (${email})`,
        metadata: { target_user_id: userId, admin_level: resolvedLevel, email }
    });

    adminNotificationService.notify({
        type: "admin_account_created",
        category: "account",
        severity: resolvedLevel === "super_admin" ? "warning" : "info",
        title: "Admin account created",
        message: `${first_name} ${last_name} (${email}) was added as ${resolvedLevel === "super_admin" ? "a super admin" : "an admin"}.`,
        metadata: { target_user_id: userId, admin_level: resolvedLevel },
        relatedUserId: userId
    });

    return { userId };
};

exports.updateAdminPermissions = async (userId, adminLevel, actorAdminId) => {
    const admins = await adminRepository.findAllAdmins();
    const target = admins.find((a) => a.id === Number(userId));

    if (!target) {
        throw new Error("Admin not found");
    }

    if (target.admin_level === "super_admin" && adminLevel !== "super_admin") {
        const superAdminCount = await adminRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
            throw new Error("Can't demote the last super admin.");
        }
    }

    const previousLevel = target.admin_level;
    const resolvedLevel = adminLevel === "super_admin" ? "super_admin" : "admin";

    await adminRepository.updateAdminLevel(userId, adminLevel);

    // Phase 5 (Audit Logs) - permission changes weren't tracked at all
    // before this; every promotion/demotion between admin and super_admin
    // now leaves a record of who changed it and what it changed from/to.
    if (previousLevel !== resolvedLevel) {
        auditService.log({
            userId: actorAdminId,
            eventType: "admin_permissions_changed",
            description: `Admin changed permissions for account #${userId} (${previousLevel} -> ${resolvedLevel})`,
            metadata: { target_user_id: Number(userId), previous_level: previousLevel, new_level: resolvedLevel }
        });

        adminNotificationService.notify({
            type: "admin_permissions_changed",
            category: "account",
            severity: resolvedLevel === "super_admin" ? "warning" : "info",
            title: "Admin permissions changed",
            message: `${target.first_name} ${target.last_name} (${target.email}) was changed from ${previousLevel} to ${resolvedLevel}.`,
            metadata: { target_user_id: Number(userId), previous_level: previousLevel, new_level: resolvedLevel },
            relatedUserId: Number(userId)
        });
    }
};

exports.removeAdmin = async (userId, requestingAdminId) => {
    if (Number(userId) === Number(requestingAdminId)) {
        throw new Error("You can't remove your own admin access.");
    }

    const admins = await adminRepository.findAllAdmins();
    const target = admins.find((a) => a.id === Number(userId));

    if (!target) {
        throw new Error("Admin not found");
    }

    if (target.admin_level === "super_admin") {
        const superAdminCount = await adminRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
            throw new Error("Can't remove the last super admin.");
        }
    }

    await adminRepository.revokeAdmin(userId);

    // This revokes admin access (demotes the row back to an ordinary
    // role - see adminRepository.revokeAdmin) rather than deleting the
    // account outright; permanentlyDeleteUser above is the separate,
    // irreversible lever for that. Still surfaced as "admin account
    // deleted" in the notification center per the Phase 2 event list,
    // since from the platform's perspective the admin account is gone.
    auditService.log({
        userId: requestingAdminId,
        eventType: "admin_account_deleted",
        description: `Admin revoked admin access for account #${userId}`,
        metadata: { target_user_id: Number(userId), was_admin_level: target.admin_level }
    });

    adminNotificationService.notify({
        type: "admin_account_deleted",
        category: "account",
        severity: "critical",
        title: "Admin account removed",
        message: `${target.first_name} ${target.last_name} (${target.email}) had their admin access revoked.`,
        metadata: { target_user_id: Number(userId), was_admin_level: target.admin_level },
        relatedUserId: userId
    });
};
