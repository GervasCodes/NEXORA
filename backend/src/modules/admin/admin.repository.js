const db = require("../../config/db");

// --- Users ---
// Deleted accounts (deleted_at set - see migration 056) are deliberately
// excluded here: they get their own read-only Deleted Accounts section
// (findAllDeletedUsers below) instead of showing up in this list with a
// misleading "Activate" button next to them.
exports.findAllUsers = async () => {
    const [rows] = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.role, u.is_active,
                u.suspended_at, u.suspension_reason, u.suspended_by,
                CONCAT(a.first_name, ' ', a.last_name) AS suspended_by_name,
                u.created_at
        FROM users u
        LEFT JOIN users a ON a.id = u.suspended_by
        WHERE u.deleted_at IS NULL
        ORDER BY u.created_at DESC`
    );
    return rows;
};

// Every account a user has soft-deleted for themselves (Phase 3 -
// account.service.js#deleteAccount). permanently_deleted_at distinguishes
// ones still awaiting review from ones an admin has already permanently
// removed (Phase 4 - see permanentlyDeleteUser below).
exports.findAllDeletedUsers = async () => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, role, deleted_at,
                permanently_deleted_at, created_at
        FROM users
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at DESC`
    );
    return rows;
};

exports.findUserById = async (userId) => {
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
    return rows[0];
};

// Suspend/Unsuspend replace the old bare is_active toggle (see migration
// 058). is_active still blocks login/API access (auth.middleware.js,
// login.service.js) - suspended_at/suspension_reason/suspended_by are the
// bookkeeping the old toggle never had, same pattern as deleted_at for
// self-deletion.
exports.suspendUser = async (userId, reason, adminId) => {
    await db.query(
        `UPDATE users
        SET is_active = FALSE, suspended_at = NOW(), suspension_reason = ?, suspended_by = ?
        WHERE id = ?`,
        [reason, adminId, userId]
    );
};

exports.unsuspendUser = async (userId) => {
    await db.query(
        `UPDATE users
        SET is_active = TRUE, suspended_at = NULL, suspension_reason = NULL, suspended_by = NULL
        WHERE id = ?`,
        [userId]
    );
};

// --- Sellers ---
// Same deleted_at exclusion as findAllUsers above - a deleted seller's
// profile still exists (Phase 4 will decide what happens to it), but it
// belongs in the Deleted Accounts section, not the regular Sellers list.
exports.findAllSellers = async () => {
    const [rows] = await db.query(
        `SELECT sp.id AS profile_id, sp.user_id, sp.store_name, sp.store_slug,
                sp.country, sp.region, sp.city, sp.is_verified,
                u.first_name, u.last_name, u.email, u.is_active
        FROM seller_profiles sp
        JOIN users u ON u.id = sp.user_id
        WHERE u.deleted_at IS NULL
        ORDER BY sp.is_verified ASC, sp.id DESC`
    );
    return rows;
};

exports.findSellerProfileByUserId = async (userId) => {
    const [rows] = await db.query(
        "SELECT * FROM seller_profiles WHERE user_id = ?",
        [userId]
    );
    return rows[0];
};

exports.setSellerVerified = async (userId, isVerified) => {
    await db.query(
        "UPDATE seller_profiles SET is_verified = ? WHERE user_id = ?",
        [isVerified, userId]
    );
};

// --- Products ---
exports.findAllProducts = async () => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, p.price, p.stock, p.is_active, p.is_sponsored, p.created_at,
                sp.store_name
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        ORDER BY p.created_at DESC
        LIMIT 200`
    );
    return rows;
};

exports.findProductById = async (productId) => {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    return rows[0];
};

exports.setProductActive = async (productId, isActive) => {
    await db.query("UPDATE products SET is_active = ? WHERE id = ?", [isActive, productId]);
};

// Phase 2C's "Sponsored products" department section. Just the display
// placement flag - the campaign/budget/payment system behind it is a
// separate, later piece of work (Phase 8A).
exports.setProductSponsored = async (productId, isSponsored) => {
    await db.query("UPDATE products SET is_sponsored = ? WHERE id = ?", [isSponsored, productId]);
};

// --- Orders (platform-wide view) ---
// parent_order_id IS NULL: top-level orders only (standalone + parents).
// A split cart's child orders carry their own slice of the total and
// exist so vendors/delivery can track them independently - listing them
// here too would show the same cart's money twice.
exports.findAllOrders = async () => {
    const [rows] = await db.query(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.created_at, o.is_parent,
                u.first_name, u.last_name, u.email
        FROM orders o
        JOIN users u ON u.id = o.buyer_id
        WHERE o.parent_order_id IS NULL
        ORDER BY o.created_at DESC
        LIMIT 200`
    );
    return rows;
};

// --- Dispatch dashboard (Phase 6) ---

// All deliveries not yet in a terminal state (delivered/failed), with
// enough order + agent detail for the dispatch board's list/map view.
// `minutes_elapsed` / `is_delayed` are computed in SQL rather than in JS
// so this stays a single round trip - `estimated_duration_minutes` is the
// road-routing ETA snapshot taken at assignment time (see
// delivery.repository.js's `create` for why it's a frozen snapshot, not
// a live value): a delivery is flagged delayed once more real minutes
// have passed since assignment than that snapshot allowed for.
exports.findActiveDeliveries = async () => {
    const [rows] = await db.query(
        `SELECT d.id, d.order_id, d.agent_id, d.status, d.delivery_fee,
                d.distance_km, d.estimated_duration_minutes, d.assigned_at,
                d.picked_up_at, d.in_transit_at,
                TIMESTAMPDIFF(MINUTE, d.assigned_at, NOW()) AS minutes_elapsed,
                (d.estimated_duration_minutes IS NOT NULL
                    AND TIMESTAMPDIFF(MINUTE, d.assigned_at, NOW()) > d.estimated_duration_minutes
                ) AS is_delayed,
                o.order_number, o.shipping_address, o.shipping_city, o.shipping_region,
                o.delivery_lat, o.delivery_lng,
                u.first_name AS agent_first_name, u.last_name AS agent_last_name,
                u.phone AS agent_phone, u.vehicle_type AS agent_vehicle_type,
                u.current_lat AS agent_current_lat, u.current_lng AS agent_current_lng,
                u.location_updated_at AS agent_location_updated_at
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        JOIN users u ON u.id = d.agent_id
        WHERE d.status NOT IN ('delivered', 'failed')
        ORDER BY is_delayed DESC, d.assigned_at ASC`
    );
    return rows;
};

// Every delivery agent currently marked online, plus how many active
// (not delivered/failed) deliveries they're carrying right now, so the
// dashboard can show idle vs busy agents at a glance without a second
// query per agent.
exports.findOnlineAgents = async () => {
    const [rows] = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.phone, u.vehicle_type,
                u.current_lat, u.current_lng, u.location_updated_at,
                COUNT(d.id) AS active_delivery_count
        FROM users u
        LEFT JOIN deliveries d
            ON d.agent_id = u.id AND d.status NOT IN ('delivered', 'failed')
        WHERE u.role = 'delivery_agent' AND u.is_online = TRUE
        GROUP BY u.id
        ORDER BY active_delivery_count ASC, u.first_name ASC`
    );
    return rows;
};

// --- Dashboard ---
exports.getDashboardStats = async () => {
    const [[userCounts]] = await db.query(
        `SELECT
            SUM(role = 'buyer') AS buyers,
            SUM(role = 'seller') AS sellers,
            SUM(role = 'delivery_agent') AS delivery_agents
        FROM users`
    );

    const [[orderCounts]] = await db.query(
        `SELECT
            COUNT(*) AS total_orders,
            SUM(status = 'pending') AS pending_orders,
            SUM(status = 'delivered') AS delivered_orders,
            SUM(status = 'cancelled') AS cancelled_orders
        FROM orders
        WHERE parent_order_id IS NULL`
    );

    const [[revenue]] = await db.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM orders
        WHERE payment_status = 'paid' AND parent_order_id IS NULL`
    );

    const [[productCounts]] = await db.query(
        `SELECT COUNT(*) AS total_products, SUM(is_active = 1) AS active_products
        FROM products`
    );

    return { userCounts, orderCounts, revenue, productCounts };
};

// --- Analytics: daily sales, top products, top sellers ---

// Revenue/order-count per day for the last N days, paid orders only.
// Doesn't fill in gap days with zero sales - admin.service.js does that,
// since it's just JS array work and keeps this a single simple query.
exports.getDailySales = async (days) => {
    const [rows] = await db.query(
        `SELECT DATE(created_at) AS day,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COUNT(*) AS order_count
        FROM orders
        WHERE payment_status = 'paid' AND parent_order_id IS NULL AND created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [days]
    );
    return rows;
};

exports.getTopProducts = async (limit) => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, sp.store_name,
                SUM(oi.quantity) AS units_sold,
                SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        WHERE o.payment_status = 'paid'
        GROUP BY p.id, p.name, p.slug, sp.store_name
        ORDER BY revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

exports.getTopSellers = async (limit) => {
    const [rows] = await db.query(
        `SELECT sp.user_id, sp.store_name, sp.is_verified,
                SUM(oi.subtotal) AS revenue,
                COUNT(DISTINCT oi.order_id) AS order_count
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN seller_profiles sp ON sp.user_id = oi.seller_id
        WHERE o.payment_status = 'paid'
        GROUP BY sp.user_id, sp.store_name, sp.is_verified
        ORDER BY revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// Old seller document-verification review queries lived here
// (findPendingVerifications / findVerificationDocuments /
// setSellerVerificationStatus) - removed along with
// seller_verification_documents (migration 029); see accountVerification
// module for the centralized replacement.

// --- Admin management (super admin only) ---

exports.findAllAdmins = async () => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, admin_level, is_active, created_at
        FROM users
        WHERE role = 'admin'
        ORDER BY admin_level = 'super_admin' DESC, created_at ASC`
    );
    return rows;
};

exports.countSuperAdmins = async () => {
    const [[row]] = await db.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND admin_level = 'super_admin' AND is_active = TRUE"
    );
    return row.count;
};

exports.createAdmin = async ({ first_name, last_name, email, phone, password, admin_level }) => {
    const [result] = await db.query(
        `INSERT INTO users (first_name, last_name, email, phone, password, role, admin_level)
        VALUES (?, ?, ?, ?, ?, 'admin', ?)`,
        [first_name, last_name, email, phone, password, admin_level]
    );
    return result.insertId;
};

exports.updateAdminLevel = async (userId, adminLevel) => {
    await db.query(
        "UPDATE users SET admin_level = ? WHERE id = ? AND role = 'admin'",
        [adminLevel, userId]
    );
};

// Revokes admin access rather than hard-deleting the account, so audit
// trails (who approved what) stay intact.
exports.revokeAdmin = async (userId) => {
    await db.query(
        "UPDATE users SET role = 'buyer', admin_level = NULL WHERE id = ? AND role = 'admin'",
        [userId]
    );
};

// --- Permanent Account Removal (Phase 4) ---
// See migration 057 and admin.service.js#permanentlyDeleteUser for the
// full reasoning. Short version: `users(id)` is referenced by orders,
// order_items, reviews, disputes, delivery_ratings, conversations/
// messages, wallet_transactions, etc. without ON DELETE CASCADE, on
// purpose, so financial/legal history survives an account's deletion -
// an actual `DELETE FROM users` would fail with a foreign key error for
// any account with real activity. These helpers instead erase every
// identifying field on the row and delete only the data that's genuinely
// safe to remove outright, leaving the row itself as an anonymized
// tombstone other tables can keep pointing at.

exports.findUserForPermanentDeletion = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, role, deleted_at, permanently_deleted_at
        FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0];
};

// --- Verification documents (owner photo / national ID / voter ID /
// driver's license - the most sensitive Cloudinary assets on the
// platform). Always safe to remove outright: nothing else references
// account_verification_documents, and account_verification_history
// (the audit trail of submit/approve/reject events) is kept separately
// and untouched, same reasoning as audit_logs surviving deletion.
exports.findAccountVerificationDocumentUrls = async (userId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT file_url FROM account_verification_documents WHERE user_id = ?",
        [userId]
    );
    return rows.map((r) => r.file_url);
};

exports.deleteAccountVerificationDocuments = async (userId, executor = db) => {
    await executor.query(
        "DELETE FROM account_verification_documents WHERE user_id = ?",
        [userId]
    );
};

// --- Seller profile ---
// The storefront itself (seller_profiles row) has to stay - products,
// orders, reviews, disputes, and wallet history all hang off it, and
// store_slug/business fields aren't safe to just null out (store_name/
// store_slug are NOT NULL and store_slug is UNIQUE) - so this scrubs
// every identifying/contact field to an anonymized placeholder instead,
// the same "erase, don't drop the row" approach as the users row itself.
exports.findSellerLogoAndBanner = async (userId, executor = db) => {
    const [rows] = await executor.query(
        "SELECT store_logo, store_banner FROM seller_profiles WHERE user_id = ?",
        [userId]
    );
    return rows[0] || null;
};

exports.scrubSellerProfile = async (userId, executor = db) => {
    await executor.query(
        `UPDATE seller_profiles
        SET store_name = 'Deleted Store',
            store_slug = CONCAT('deleted-store-', user_id),
            store_description = NULL,
            store_tagline = NULL,
            store_logo = NULL,
            store_banner = NULL,
            business_email = NULL,
            business_phone = NULL,
            address = NULL,
            pickup_lat = NULL,
            pickup_lng = NULL,
            social_instagram = NULL,
            social_facebook = NULL,
            social_whatsapp = NULL
        WHERE user_id = ?`,
        [userId]
    );
};

// --- Products that never had a single order ---
// A product with real order_items can't be deleted (order_items.product_id
// has no ON DELETE clause - see migration 006) and shouldn't be: a
// buyer's Order History still needs to show what they actually bought.
// Genuinely orphaned listings (never sold) have no such dependency and
// are removed entirely, cascading to their own product_images/
// product_videos/product_audio/reviews/wishlist rows.
exports.findNeverOrderedProductIds = async (userId, executor = db) => {
    const [rows] = await executor.query(
        `SELECT p.id FROM products p
        WHERE p.seller_id = ?
        AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)`,
        [userId]
    );
    return rows.map((r) => r.id);
};

exports.findProductMediaUrls = async (productIds, executor = db) => {
    if (!productIds.length) return [];

    const [images] = await executor.query(
        `SELECT image_url AS url FROM product_images WHERE product_id IN (?)`,
        [productIds]
    );
    const [videos] = await executor.query(
        `SELECT video_url AS url FROM product_videos WHERE product_id IN (?)`,
        [productIds]
    );
    const [audio] = await executor.query(
        `SELECT audio_url AS url FROM product_audio WHERE product_id IN (?)`,
        [productIds]
    );

    return [...images, ...videos, ...audio].map((r) => r.url);
};

// product_images/product_videos/product_audio/reviews/review_photos
// (via reviews) and wishlist_items all cascade from products(id) - see
// migrations 004, 023, 044, 045, 046 - so deleting the product rows here
// is enough to clean up every dependent row in one statement each.
exports.deleteProducts = async (productIds, executor = db) => {
    if (!productIds.length) return;
    await executor.query("DELETE FROM products WHERE id IN (?)", [productIds]);
};

// --- Purely personal, no other party depends on these ---
exports.deleteWishlistItems = async (userId, executor = db) => {
    await executor.query("DELETE FROM wishlist_items WHERE user_id = ?", [userId]);
};

exports.deleteOtpCodes = async (userId, executor = db) => {
    await executor.query("DELETE FROM otp_codes WHERE user_id = ?", [userId]);
};

exports.deleteNotifications = async (userId, executor = db) => {
    await executor.query("DELETE FROM notifications WHERE user_id = ?", [userId]);
};

// A seller's curated storefront collections (seller_collections) and a
// seller's chosen roster of hired delivery agents (seller_delivery_agents,
// both directions - the account being deleted might be the seller who
// hired agents, or an agent someone else hired) are pure store-management
// bookkeeping with no cross-party record-keeping value once the account
// is gone. seller_collection_products cascades from seller_collections(id).
exports.deleteSellerCollections = async (userId, executor = db) => {
    await executor.query("DELETE FROM seller_collections WHERE seller_id = ?", [userId]);
};

exports.deleteSellerDeliveryAgentLinks = async (userId, executor = db) => {
    await executor.query(
        "DELETE FROM seller_delivery_agents WHERE seller_id = ? OR agent_id = ?",
        [userId, userId]
    );
};

// Dispatch offers (offered/accepted/declined/expired) for a delivery
// agent - resolved-or-stale operational rows, not a record either party
// needs after the fact (the resulting delivery, if any, is the durable
// record - deliveries.agent_id is untouched here).
exports.deleteDeliveryOffersForAgent = async (userId, executor = db) => {
    await executor.query("DELETE FROM delivery_offers WHERE agent_id = ?", [userId]);
};

// --- Chat content ---
// Conversations/messages stay (the other participant's thread shouldn't
// vanish), but the deleted account's own message text is scrubbed using
// the same tombstone mechanism "delete message" already uses (migration
// 021) - the bubble renders as "This message was deleted" instead of
// leaking their old message content.
exports.tombstoneSentMessages = async (userId, executor = db) => {
    await executor.query(
        `UPDATE messages
        SET is_deleted = TRUE, deleted_at = NOW()
        WHERE sender_id = ? AND is_deleted = FALSE`,
        [userId]
    );
};

// --- Full removal attempt ---
// Tried only after every table in the "safe to delete outright" section
// above has already been cleared in this same transaction. What's left
// pointing at users(id) without ON DELETE CASCADE at this point is
// exactly the financial/legal/other-party record set from migration
// 057's header comment (orders, order_items as seller, payments,
// reviews, disputes, refunds, delivery_ratings, deliveries as agent,
// wallet/withdrawal/earnings history, sponsorship-style campaigns,
// conversations/messages as sender). Asking MySQL directly (rather than
// re-deriving that table list by hand, and risking missing one as the
// schema grows) is the reliable way to know whether it's actually safe
// to drop the row: a SAVEPOINT lets a blocked DELETE roll back to
// exactly this point without losing the cleanup already done in this
// transaction. Returns true if the row (and, via cascade, its
// seller_profiles row) is genuinely gone; false if it's still
// referenced elsewhere, in which case scrubUserPII below is the
// fallback.
exports.attemptHardDeleteUser = async (userId, connection) => {
    await connection.query("SAVEPOINT before_hard_delete");

    try {
        await connection.query("DELETE FROM users WHERE id = ?", [userId]);
        return true;

    } catch (error) {
        if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
            await connection.query("ROLLBACK TO SAVEPOINT before_hard_delete");
            return false;
        }
        throw error;
    }
};

// --- The users row itself (fallback when attemptHardDeleteUser can't
// drop the row outright) ---
// Erases every remaining identifying field. email/phone are UNIQUE NOT
// NULL, so they get a placeholder that can never collide rather than
// NULL. password was already randomized at soft-delete time (Phase 3,
// self-delete) if the account went through that first, and is left
// as-is either way - a scrubbed account can never log in again since
// its email no longer matches what the user knows.
//
// is_active = FALSE and deleted_at are set here too (previously only
// deleted_at was ever set, and only by the self-delete step at Phase 3
// - an account an admin permanently deleted *without* it ever having
// been self-deleted first kept is_active = TRUE and deleted_at = NULL
// forever, which left it showing up in the regular Users list as
// "Active" even though its email/password no longer worked). Both are
// idempotent against an account that already went through self-delete.
exports.scrubUserPII = async (userId, executor = db) => {
    await executor.query(
        `UPDATE users
        SET first_name = 'Deleted',
            last_name = 'User',
            email = CONCAT('deleted-user-', id, '@deleted.nexora'),
            phone = CONCAT('deleted-', id),
            current_lat = NULL,
            current_lng = NULL,
            vehicle_type = NULL,
            vehicle_plate_number = NULL,
            is_active = FALSE,
            deleted_at = COALESCE(deleted_at, NOW()),
            permanently_deleted_at = NOW()
        WHERE id = ?`,
        [userId]
    );
};
