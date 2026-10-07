const db = require("../../config/db");
const dataResetRepository = require("./dataReset.repository");
const auditRepository = require("../audit/audit.repository");
const auditService = require("../audit/audit.service");
const adminNotificationService = require("../adminNotification/adminNotification.service");
const comparePassword = require("../../utils/comparePassword");
const logger = require("../../utils/logger").child({ module: "data-reset" });

const APPROVAL_TTL_MINUTES = 30;

const isProduction = () => process.env.NODE_ENV === "production";

const forbidden = (message) => {
    const error = new Error(message);
    error.status = 403;
    return error;
};

// Production guardrails for the platform-wide reset. Outside production the
// flags are not needed (local/staging resets stay possible).
//  - ALLOW_PLATFORM_DATA_RESET=true must be set on the server;
//  - a reset of ALL data (test_only = false) needs a second flag,
//    ALLOW_PLATFORM_DATA_RESET_REAL=true, so a mis-sent request cannot wipe
//    real orders on its own.
const assertPlatformResetAllowed = (testOnly) => {
    if (!isProduction()) return;
    if (process.env.ALLOW_PLATFORM_DATA_RESET !== "true") {
        throw forbidden("A platform-wide reset is disabled on this server (ALLOW_PLATFORM_DATA_RESET is not set).");
    }
    if (!testOnly && process.env.ALLOW_PLATFORM_DATA_RESET_REAL !== "true") {
        throw forbidden("Resetting real (non-test) data platform-wide is disabled on this server (ALLOW_PLATFORM_DATA_RESET_REAL is not set).");
    }
};

const assertFreshPassword = async (actorId, password) => {
    if (typeof password !== "string" || !password) {
        throw badRequest("Enter your password to confirm this action.");
    }
    const hash = await dataResetRepository.findUserPasswordHash(actorId);
    if (!hash || !(await comparePassword(password, hash))) {
        throw forbidden("Password incorrect.");
    }
};

// The exact string an admin has to type to arm each reset. Not a checkbox
// and not a generic "yes": the phrase names the thing being destroyed, so
// there is no way to trigger a platform-wide wipe by muscle-memorying
// through a per-seller one. Compared case-sensitively and after trimming
// only surrounding whitespace.
const sellerConfirmationPhrase = (sellerId) => `RESET SELLER ${sellerId}`;
const PLATFORM_CONFIRMATION_PHRASE = "RESET ENTIRE PLATFORM";

exports.sellerConfirmationPhrase = sellerConfirmationPhrase;
exports.PLATFORM_CONFIRMATION_PHRASE = PLATFORM_CONFIRMATION_PHRASE;

const badRequest = (message) => {
    const error = new Error(message);
    error.status = 400;
    return error;
};

const notFound = (message) => {
    const error = new Error(message);
    error.status = 404;
    return error;
};

const requireConfirmation = (given, expected) => {
    if (typeof given !== "string" || given.trim() !== expected) {
        throw badRequest(
            `This action is irreversible. To proceed, type exactly: ${expected}`
        );
    }
};

const totalRows = (counts) => Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);

// ---- Previews -------------------------------------------------------------
// Read-only. Deliberately a separate endpoint rather than a `dryRun` flag on
// the reset itself: a flag that defaults to the safe value is one typo away
// from defaulting to the destructive one, whereas a GET that has no code
// path to a DELETE can't destroy anything no matter what it's sent.

exports.previewSellerReset = async (sellerId, { testOnly = true } = {}) => {
    const seller = await dataResetRepository.findSeller(sellerId);
    if (!seller) throw notFound("Seller not found.");

    const orderIds = await dataResetRepository.findSellerOrderIds(sellerId, { testOnly });
    const bookingIds = await dataResetRepository.findSellerBookingIds(sellerId, { testOnly });
    const counts = await dataResetRepository.countSellerScope(sellerId, { testOnly, orderIds, bookingIds });
    const sampleOrders = await dataResetRepository.sampleOrders(orderIds);

    return {
        scope: "seller",
        sample_orders: sampleOrders,
        test_only: testOnly,
        seller: {
            id: seller.id,
            name: `${seller.first_name} ${seller.last_name}`,
            email: seller.email,
            store_name: seller.store_name || null
        },
        counts,
        total_rows: totalRows(counts),
        confirmation_phrase: sellerConfirmationPhrase(seller.id),
        reversible: false
    };
};

exports.previewPlatformReset = async ({ testOnly = true } = {}) => {
    const orderIds = await dataResetRepository.findAllOrderIds({ testOnly });
    const bookingIds = await dataResetRepository.findAllBookingIds({ testOnly });
    const counts = await dataResetRepository.countPlatformScope({ testOnly, orderIds, bookingIds });
    const [sampleOrders, paidOrders, realOrders] = await Promise.all([
        dataResetRepository.sampleOrders(orderIds),
        dataResetRepository.countPaidOrders(orderIds),
        dataResetRepository.countRealOrdersIn(orderIds)
    ]);

    return {
        scope: "platform",
        sample_orders: sampleOrders,
        paid_orders_in_scope: paidOrders,
        real_orders_in_scope: realOrders,
        reset_allowed_here: !isProduction() || process.env.ALLOW_PLATFORM_DATA_RESET === "true",
        real_data_reset_allowed_here: !isProduction() || process.env.ALLOW_PLATFORM_DATA_RESET_REAL === "true",
        requires_second_approver: isProduction(),
        test_only: testOnly,
        counts,
        total_rows: totalRows(counts),
        confirmation_phrase: PLATFORM_CONFIRMATION_PHRASE,
        reversible: false
    };
};

// ---- Execution ------------------------------------------------------------

// The audit entry is written BEFORE anything is deleted, and awaited rather
// than fired and forgotten the way auditService.log does everywhere else.
// Two reasons this one action is the exception: the rows that would let you
// reconstruct what happened are about to stop existing, and if the audit
// insert itself is broken we want to find out before the data is gone, not
// after. A reset that can't be recorded doesn't run.
const recordIntent = async ({ req, actorId, eventType, description, metadata }) => {
    try {
        await auditRepository.insertLog({
            userId: actorId,
            eventType,
            description,
            ipAddress: req?.ip || null,
            metadata
        });
    } catch (error) {
        logger.error({ err: error, eventType }, "refusing to run data reset: audit log write failed");
        const wrapped = new Error(
            "Could not record this action in the audit log, so it was not performed. Try again."
        );
        wrapped.status = 500;
        throw wrapped;
    }
};

exports.resetSeller = async (sellerId, { testOnly = true, confirmation } = {}, { actorId, req } = {}) => {
    const seller = await dataResetRepository.findSeller(sellerId);
    if (!seller) throw notFound("Seller not found.");

    // Scoping guard. Without this, a mistyped id pointing at a buyer or an
    // admin account would run a reset that silently matched nothing and
    // reported success - or worse, matched that account's buyer-side rows.
    if (seller.role !== "seller") {
        throw badRequest("That account is not a seller. Per-seller reset only applies to seller accounts.");
    }

    requireConfirmation(confirmation, sellerConfirmationPhrase(seller.id));

    const orderIds = await dataResetRepository.findSellerOrderIds(sellerId, { testOnly });
    const parentCandidates = await dataResetRepository.findParentIdsOf(orderIds);
    const bookingIds = await dataResetRepository.findSellerBookingIds(sellerId, { testOnly });
    const planned = await dataResetRepository.countSellerScope(sellerId, { testOnly, orderIds, bookingIds });

    await recordIntent({
        req,
        actorId,
        eventType: "data_reset.seller",
        description:
            `Admin ${testOnly ? "cleared test data for" : "reset all data for"} seller #${seller.id}` +
            `${seller.store_name ? ` (${seller.store_name})` : ""} - irreversible hard delete`,
        metadata: {
            scope: "seller",
            seller_id: Number(seller.id),
            store_name: seller.store_name || null,
            test_only: testOnly,
            planned_counts: planned,
            hard_delete: true
        }
    });

    const connection = await db.getConnection();
    let deleted;

    try {
        await connection.beginTransaction();

        await dataResetRepository.deleteBuyerLedgerForOrders(connection, orderIds);
        const { orders } = await dataResetRepository.deleteOrderTree(connection, orderIds);
        const { bookings } = await dataResetRepository.deleteBookingTree(connection, bookingIds);

        // Only after the children are gone can we tell which parents are
        // now empty - a parent shared with another seller still has that
        // seller's child and must survive.
        const orphanedParents = await dataResetRepository.findOrphanedParentOrderIds(
            connection,
            parentCandidates
        );
        const { orders: parentsDeleted } = await dataResetRepository.deleteOrderTree(
            connection,
            orphanedParents
        );

        const reviews = await dataResetRepository.deleteSellerReviews(connection, sellerId, { testOnly });
        const conversations = await dataResetRepository.deleteSellerConversations(connection, sellerId, { testOnly });
        const disputes = await dataResetRepository.deleteSellerDisputes(connection, sellerId, { testOnly });
        const returns = await dataResetRepository.deleteSellerReturns(connection, sellerId, { testOnly });
        const wallet = await dataResetRepository.deleteSellerWalletLedger(connection, sellerId, { testOnly });

        await dataResetRepository.recomputeSellerWallets(connection, sellerId);
        await dataResetRepository.recomputeBuyerWallets(connection);

        await connection.commit();

        deleted = {
            orders: orders + parentsDeleted,
            bookings,
            reviews,
            conversations,
            disputes,
            returns,
            ...wallet
        };

    } catch (error) {
        await connection.rollback();
        logger.error({ err: error, sellerId }, "seller data reset failed and was rolled back");
        throw error;

    } finally {
        connection.release();
    }

    auditService.log({
        userId: actorId,
        eventType: "data_reset.seller_completed",
        description: `Seller #${seller.id} data reset completed (${totalRows(deleted)} rows deleted)`,
        metadata: { scope: "seller", seller_id: Number(seller.id), test_only: testOnly, deleted_counts: deleted }
    });

    adminNotificationService.notify({
        type: "data_reset_performed",
        category: "account",
        severity: "warning",
        title: "Seller data reset",
        message:
            `${seller.store_name || `${seller.first_name} ${seller.last_name}`}'s ` +
            `${testOnly ? "test" : "transactional"} data was permanently deleted by an admin ` +
            `(${totalRows(deleted)} rows).`,
        metadata: { scope: "seller", seller_id: Number(seller.id), test_only: testOnly },
        relatedUserId: seller.id
    });

    return { scope: "seller", seller_id: Number(seller.id), test_only: testOnly, deleted, reversible: false };
};

// Step 1 of a production platform reset: a super admin asks for it.
exports.requestPlatformResetApproval = async ({ testOnly = true } = {}, { actorId }) => {
    assertPlatformResetAllowed(testOnly);
    const id = await dataResetRepository.createApproval(actorId, testOnly, APPROVAL_TTL_MINUTES);

    auditService.log({
        userId: actorId,
        eventType: "data_reset.platform_requested",
        description: `Super admin requested approval for a platform reset (${testOnly ? "test data only" : "ALL data"})`,
        metadata: { approval_id: id, test_only: testOnly }
    });
    adminNotificationService.notify({
        type: "data_reset_performed",
        category: "security",
        severity: "critical",
        title: "Platform reset needs a second approver",
        message: `A super admin asked to reset ${testOnly ? "test" : "ALL"} platform data. Another super admin must approve it within ${APPROVAL_TTL_MINUTES} minutes.`,
        metadata: { approval_id: id, test_only: testOnly }
    });

    return { approval_id: id, expires_in_minutes: APPROVAL_TTL_MINUTES };
};

// Step 2: a DIFFERENT super admin approves, re-entering their password.
exports.approvePlatformReset = async (approvalId, { actorId, password, req }) => {
    await assertFreshPassword(actorId, password);

    const approval = await dataResetRepository.findApproval(approvalId);
    if (!approval) throw notFound("Approval request not found.");
    if (Number(approval.requested_by) === Number(actorId)) {
        throw forbidden("You cannot approve your own reset request.");
    }

    const changed = await dataResetRepository.approve(approvalId, actorId);
    if (!changed) throw badRequest("This request is expired, already approved or already used.");

    auditService.logFromRequest(req || { ip: null }, {
        userId: actorId,
        eventType: "data_reset.platform_approved",
        description: `Super admin approved platform reset request #${approvalId}`,
        metadata: { approval_id: Number(approvalId), requested_by: approval.requested_by, test_only: !!approval.test_only }
    });

    return { approval_id: Number(approvalId), approved: true };
};

exports.resetPlatform = async ({ testOnly = true, confirmation, password, approvalId } = {}, { actorId, req } = {}) => {
    assertPlatformResetAllowed(testOnly);
    requireConfirmation(confirmation, PLATFORM_CONFIRMATION_PHRASE);
    await assertFreshPassword(actorId, password);

    const orderIds = await dataResetRepository.findAllOrderIds({ testOnly });
    const bookingIds = await dataResetRepository.findAllBookingIds({ testOnly });

    // The is_test marker is only set by seeders / explicit admin action. If a
    // "test only" scope contains orders that were actually paid through a
    // payment provider, the marker is suspect: refuse in production.
    if (testOnly && isProduction()) {
        const paid = await dataResetRepository.countPaidOrders(orderIds);
        if (paid > 0) {
            throw badRequest(
                `${paid} order(s) marked as test have a completed online payment. Check the test marker before resetting.`
            );
        }
    }

    if (isProduction()) {
        if (!approvalId) throw forbidden("A second super admin must approve this reset first.");
        const consumed = await dataResetRepository.consumeApproval(approvalId, actorId, testOnly);
        if (!consumed) throw forbidden("The approval is missing, expired, already used, or does not match this request.");
    }
    const planned = await dataResetRepository.countPlatformScope({ testOnly, orderIds, bookingIds });

    await recordIntent({
        req,
        actorId,
        eventType: "data_reset.platform",
        description: `Super admin ${testOnly ? "cleared all test data platform-wide" : "reset ALL platform transactional data"} - irreversible hard delete`,
        metadata: { scope: "platform", test_only: testOnly, planned_counts: planned, hard_delete: true }
    });

    const connection = await db.getConnection();
    let deleted;

    try {
        await connection.beginTransaction();

        // Platform scope resolves every order id, parents included, so
        // there's no orphaned-parent pass to do here: a parent whose
        // children are all in scope is itself in scope already.
        const { orders } = await dataResetRepository.deleteOrderTree(connection, orderIds);
        const { bookings } = await dataResetRepository.deleteBookingTree(connection, bookingIds);

        const reviews = await dataResetRepository.deleteAllReviews(connection, { testOnly });
        const conversations = await dataResetRepository.deleteAllConversations(connection, { testOnly });
        const disputes = await dataResetRepository.deleteAllDisputes(connection, { testOnly });
        const returns = await dataResetRepository.deleteAllReturns(connection, { testOnly });
        const wallet = await dataResetRepository.deleteAllWalletLedger(connection, { testOnly });
        const buyerLedger = await dataResetRepository.deleteAllBuyerLedger(connection, { testOnly });

        await dataResetRepository.recomputeSellerWallets(connection, null);
        await dataResetRepository.recomputeBuyerWallets(connection);

        await connection.commit();

        deleted = {
            orders,
            bookings,
            reviews,
            conversations,
            disputes,
            returns,
            buyer_wallet_transactions: buyerLedger,
            ...wallet
        };

    } catch (error) {
        await connection.rollback();
        logger.error({ err: error }, "platform data reset failed and was rolled back");
        throw error;

    } finally {
        connection.release();
    }

    auditService.log({
        userId: actorId,
        eventType: "data_reset.platform_completed",
        description: `Platform data reset completed (${totalRows(deleted)} rows deleted)`,
        metadata: { scope: "platform", test_only: testOnly, deleted_counts: deleted }
    });

    adminNotificationService.notify({
        type: "data_reset_performed",
        // 'security', not a new 'system' value: admin_notifications.category
        // is an ENUM('account','moderation','security') (migration 059) and
        // widening it is out of this phase's scope. A super admin wiping
        // platform data is a security-relevant event either way.
        category: "security",
        severity: "critical",
        title: "Platform data reset",
        message: `All ${testOnly ? "test" : "transactional"} data was permanently deleted platform-wide by a super admin (${totalRows(deleted)} rows).`,
        metadata: { scope: "platform", test_only: testOnly }
    });

    return { scope: "platform", test_only: testOnly, deleted, reversible: false };
};
