const db = require("../../config/db");
const { buildProductSearchPlan } = require("../../utils/productSearch");

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
// Phase A4: search (name/brand/store) + category + status filters, plus
// pagination - same shape as product.repository.js#findAll (search plan,
// LIMIT/OFFSET, separate COUNT(*) for total), minus the is_active=1
// restriction that query applies since admin needs to see removed
// products too (that's what the status filter is for here).
exports.findAllProducts = async ({ search, categoryId, status, page, limit }) => {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (categoryId) {
        conditions.push("p.category_id = ?");
        params.push(categoryId);
    }

    if (status === "active") {
        conditions.push("p.is_active = 1");
    } else if (status === "inactive") {
        conditions.push("p.is_active = 0");
    }

    const searchPlan = buildProductSearchPlan(search);
    if (searchPlan.mode === "fulltext") {
        conditions.push("(MATCH(p.name, p.brand, p.description) AGAINST (? IN BOOLEAN MODE) OR sp.store_name LIKE ?)");
        params.push(searchPlan.booleanQuery, `%${searchPlan.raw}%`);
    } else if (searchPlan.mode === "like") {
        conditions.push("(p.name LIKE ? OR sp.store_name LIKE ?)");
        params.push(`%${searchPlan.raw}%`, `%${searchPlan.raw}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, p.price, p.stock, p.is_active, p.is_sponsored, p.created_at,
                sp.store_name,
                (
                    SELECT pi.image_url FROM product_images pi
                    WHERE pi.product_id = p.id AND pi.is_primary = 1
                    LIMIT 1
                ) AS image_url
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM products p
        JOIN seller_profiles sp ON sp.user_id = p.seller_id
        ${whereClause}`,
        params
    );

    return { rows, total };
};

exports.findProductById = async (productId) => {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    return rows[0];
};

// Bulk counterpart of findProductById, for the bulk activate/deactivate
// action - one query for every selected row's seller_id/name instead of
// N, so the per-product notification loop in admin.service.js doesn't
// also cost N extra SELECTs.
exports.findProductsByIds = async (ids) => {
    if (!ids.length) return [];
    const [rows] = await db.query("SELECT * FROM products WHERE id IN (?)", [ids]);
    return rows;
};

exports.setProductActive = async (productId, isActive) => {
    await db.query("UPDATE products SET is_active = ? WHERE id = ?", [isActive, productId]);
};

exports.setProductsActiveBulk = async (ids, isActive) => {
    if (!ids.length) return;
    await db.query("UPDATE products SET is_active = ? WHERE id IN (?)", [isActive, ids]);
};

// Phase 2C's "Sponsored products" department section. Just the display
// placement flag - the campaign/budget/payment system behind it is a
// separate, later piece of work (Phase 8A).
exports.setProductSponsored = async (productId, isSponsored) => {
    await db.query("UPDATE products SET is_sponsored = ? WHERE id = ?", [isSponsored, productId]);
};

// --- Services ---
// Same search/category/status/pagination shape as findAllProducts above -
// see that function's comment for what each filter does.
exports.findAllServices = async ({ search, categoryId, status, page, limit }) => {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (categoryId) {
        conditions.push("s.category_id = ?");
        params.push(categoryId);
    }

    if (status === "active") {
        conditions.push("s.is_active = 1");
    } else if (status === "inactive") {
        conditions.push("s.is_active = 0");
    }

    const searchPlan = buildProductSearchPlan(search);
    if (searchPlan.mode === "fulltext") {
        conditions.push("(MATCH(s.title, s.description) AGAINST (? IN BOOLEAN MODE) OR sp.store_name LIKE ?)");
        params.push(searchPlan.booleanQuery, `%${searchPlan.raw}%`);
    } else if (searchPlan.mode === "like") {
        conditions.push("(s.title LIKE ? OR sp.store_name LIKE ?)");
        params.push(`%${searchPlan.raw}%`, `%${searchPlan.raw}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
        `SELECT s.id, s.title AS name, s.slug, s.base_price AS price, s.is_active, s.status, s.created_at,
                sp.store_name,
                (
                    SELECT sm.media_url FROM service_media sm
                    WHERE sm.service_id = s.id AND sm.is_primary = 1
                    LIMIT 1
                ) AS image_url
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM services s
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        ${whereClause}`,
        params
    );

    return { rows, total };
};

exports.findServiceById = async (serviceId) => {
    const [rows] = await db.query("SELECT * FROM services WHERE id = ?", [serviceId]);
    return rows[0];
};

exports.findServicesByIds = async (ids) => {
    if (!ids.length) return [];
    const [rows] = await db.query("SELECT * FROM services WHERE id IN (?)", [ids]);
    return rows;
};

exports.setServiceActive = async (serviceId, isActive) => {
    await db.query("UPDATE services SET is_active = ? WHERE id = ?", [isActive, serviceId]);
};

exports.setServicesActiveBulk = async (ids, isActive) => {
    if (!ids.length) return;
    await db.query("UPDATE services SET is_active = ? WHERE id IN (?)", [isActive, ids]);
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
//
// LEFT JOINs the seller's pickup pin (via order_items -> seller_profiles,
// same pattern as delivery.repository's findByOrderIdWithAgent) so the
// dispatch map can plot the shop location and draw the shop -> buyer leg
// of each active delivery, not just where the agent currently is.
// Nullable like every other pickup-pin read - a seller who hasn't set one
// yet just means that delivery's shop marker/route line doesn't render.
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
                u.location_updated_at AS agent_location_updated_at,
                sp.store_name AS seller_store_name,
                sp.pickup_lat AS seller_pickup_lat, sp.pickup_lng AS seller_pickup_lng
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        JOIN users u ON u.id = d.agent_id
        LEFT JOIN (
            SELECT order_id, MIN(seller_id) AS seller_id
            FROM order_items
            GROUP BY order_id
        ) oi ON oi.order_id = o.id
        LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
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

// Phase 3 (Admin Manual Override & Ops Visibility) - the "manual pool"
// counterpart to findActiveDeliveries above: orders that shipped but
// never got a delivery record, and aren't currently mid-offer either
// (same base shape as delivery.repository.js's findAvailableForPickup/
// findUnmatchedForRematch), with the extra fields the dispatch board
// needs to show and act on them - how long each has been waiting (the
// "stalled" flag is applied from this in admin.service.js, not here) and
// delivery coordinates for the map.
exports.findUnmatchedOrders = async () => {
    const [rows] = await db.query(
        `SELECT o.id AS order_id, o.order_number, o.shipping_address,
                o.shipping_city, o.shipping_region, o.total_amount,
                o.delivery_lat, o.delivery_lng, o.created_at,
                TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS minutes_waiting
        FROM orders o
        LEFT JOIN deliveries d ON d.order_id = o.id
        LEFT JOIN delivery_offers off ON off.order_id = o.id AND off.status = 'offered'
        WHERE o.status = 'shipped' AND d.id IS NULL AND o.delivery_mode = 'platform' AND off.id IS NULL
        ORDER BY o.created_at ASC`
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

    // Phase 5 (Growth) - services counterpart of orderCounts/productCounts
    // above, same shape.
    const [[bookingCounts]] = await db.query(
        `SELECT
            COUNT(*) AS total_bookings,
            SUM(status = 'pending') AS pending_bookings,
            SUM(status = 'completed') AS completed_bookings,
            SUM(status = 'cancelled') AS cancelled_bookings
        FROM bookings`
    );

    const [[bookingRevenue]] = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_booking_revenue
        FROM bookings
        WHERE payment_status = 'paid'`
    );

    const [[serviceCounts]] = await db.query(
        `SELECT COUNT(*) AS total_services, SUM(is_active = 1 AND status = 'published') AS active_services
        FROM services`
    );

    return { userCounts, orderCounts, revenue, productCounts, bookingCounts, bookingRevenue, serviceCounts };
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

// --- Analytics: services counterpart (Phase 5 - Growth) ---------------

exports.getDailyBookingSales = async (days) => {
    const [rows] = await db.query(
        `SELECT DATE(created_at) AS day,
                COALESCE(SUM(amount), 0) AS revenue,
                COUNT(*) AS booking_count
        FROM bookings
        WHERE payment_status = 'paid' AND created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [days]
    );
    return rows;
};

exports.getTopServices = async (limit) => {
    const [rows] = await db.query(
        `SELECT s.id, s.title, s.slug, sp.store_name,
                COUNT(b.id) AS booking_count,
                SUM(b.amount) AS revenue
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        JOIN seller_profiles sp ON sp.user_id = s.provider_id
        WHERE b.payment_status = 'paid'
        GROUP BY s.id, s.title, s.slug, sp.store_name
        ORDER BY revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

exports.getTopProviders = async (limit) => {
    const [rows] = await db.query(
        `SELECT sp.user_id, sp.store_name, sp.is_verified,
                SUM(b.amount) AS revenue,
                COUNT(DISTINCT b.id) AS booking_count
        FROM bookings b
        JOIN seller_profiles sp ON sp.user_id = b.provider_id
        WHERE b.payment_status = 'paid'
        GROUP BY sp.user_id, sp.store_name, sp.is_verified
        ORDER BY revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// Advanced reporting (Phase 5 - Growth): bookings/revenue grouped by
// service category, for the "which category is actually driving
// revenue" question a top-N services/providers list can't answer on
// its own.
exports.getCategoryPerformance = async () => {
    const [rows] = await db.query(
        `SELECT sc.id, sc.name,
                COUNT(b.id) AS booking_count,
                COALESCE(SUM(b.amount), 0) AS revenue
        FROM service_categories sc
        LEFT JOIN services s ON s.category_id = sc.id
        LEFT JOIN bookings b ON b.service_id = s.id AND b.payment_status = 'paid'
        GROUP BY sc.id, sc.name
        ORDER BY revenue DESC`
    );
    return rows;
};

// --- Business metrics (Phase 4 - Analytics & Business Metrics) --------
//
// These queries back adminService.getBusinessMetrics - a deliberately
// separate endpoint from getDashboard/getAnalytics above rather than
// folding into either: getDashboard is point-in-time counts and
// getAnalytics/getServicesAnalytics are per-vertical trend charts,
// while this is blended GMV/take-rate/retention math that reads from
// both orders and bookings at once and answers a different question
// ("how healthy is the marketplace as a business", not "what happened
// today").

// GMV (Gross Merchandise Value) - the total value of paid transactions
// flowing through the platform, BEFORE commission is deducted. This is
// deliberately the same "paid orders' total_amount" / "paid bookings'
// amount" shape getDashboardStats/getDailySales already use for
// revenue - GMV and what this codebase has been calling "revenue" are
// the same number for a marketplace that never takes inventory risk;
// this query just also buckets it into today/7d/30d/all-time windows
// so a single call can back every period a dashboard stat card needs
// without four separate round trips.
exports.getGmvBreakdown = async () => {
    const [[products]] = await db.query(
        `SELECT
            COALESCE(SUM(total_amount), 0) AS gmv_all_time,
            COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN total_amount ELSE 0 END), 0) AS gmv_today,
            COALESCE(SUM(CASE WHEN created_at >= (NOW() - INTERVAL 7 DAY) THEN total_amount ELSE 0 END), 0) AS gmv_7d,
            COALESCE(SUM(CASE WHEN created_at >= (NOW() - INTERVAL 30 DAY) THEN total_amount ELSE 0 END), 0) AS gmv_30d,
            COUNT(*) AS paid_count
        FROM orders
        WHERE payment_status = 'paid' AND parent_order_id IS NULL`
    );

    const [[bookings]] = await db.query(
        `SELECT
            COALESCE(SUM(amount), 0) AS gmv_all_time,
            COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN amount ELSE 0 END), 0) AS gmv_today,
            COALESCE(SUM(CASE WHEN created_at >= (NOW() - INTERVAL 7 DAY) THEN amount ELSE 0 END), 0) AS gmv_7d,
            COALESCE(SUM(CASE WHEN created_at >= (NOW() - INTERVAL 30 DAY) THEN amount ELSE 0 END), 0) AS gmv_30d,
            COUNT(*) AS paid_count
        FROM bookings
        WHERE payment_status = 'paid'`
    );

    return { products, bookings };
};

// Take rate - the platform's actual commission revenue as a share of
// GMV. Reads the *stored* commission_amount snapshot on each item
// (order_items / booking_items, set once at wallet-credit time - see
// migration 017/064's design notes) rather than recomputing against
// today's platform_settings.commission_rate, so a historical rate
// change doesn't retroactively distort what was actually taken on past
// transactions. wallet_credited = TRUE is the same "has this snapshot
// actually been written" guard sellerRepository.getOrderTotals already
// relies on.
exports.getTakeRateBreakdown = async () => {
    const [[products]] = await db.query(
        `SELECT
            COALESCE(SUM(oi.subtotal), 0) AS gmv,
            COALESCE(SUM(oi.commission_amount), 0) AS commission_revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid' AND oi.wallet_credited = TRUE`
    );

    const [[bookings]] = await db.query(
        `SELECT
            COALESCE(SUM(bi.subtotal), 0) AS gmv,
            COALESCE(SUM(bi.commission_amount), 0) AS commission_revenue
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE b.payment_status = 'paid' AND bi.wallet_credited = TRUE`
    );

    return { products, bookings };
};

// Repeat-buyer metrics, platform-wide and blended across both verticals
// (a buyer who has bought a product AND booked a service is one buyer,
// not two) - a paid order and a paid booking are both just "a
// transaction by this buyer" for this question, unioned by created_at
// so the 30-day new-vs-returning split below can bucket on one shared
// timeline.
const BUYER_TRANSACTIONS_SQL = `
    SELECT buyer_id, created_at FROM orders
    WHERE payment_status = 'paid' AND parent_order_id IS NULL
    UNION ALL
    SELECT customer_id AS buyer_id, created_at FROM bookings
    WHERE payment_status = 'paid'
`;

exports.getBuyerRetentionMetrics = async () => {
    const [[allTimeRows], [periodRows]] = await Promise.all([
        db.query(
            `SELECT
                COUNT(*) AS total_buyers,
                COALESCE(SUM(txn_count > 1), 0) AS repeat_buyers
            FROM (
                SELECT buyer_id, COUNT(*) AS txn_count
                FROM (${BUYER_TRANSACTIONS_SQL}) t
                GROUP BY buyer_id
            ) x`
        ),
        db.query(
            `SELECT
                COUNT(DISTINCT recent.buyer_id) AS active_buyers,
                COALESCE(COUNT(DISTINCT prior.buyer_id), 0) AS returning_buyers
            FROM (
                SELECT DISTINCT buyer_id FROM (${BUYER_TRANSACTIONS_SQL}) t
                WHERE created_at >= (NOW() - INTERVAL 30 DAY)
            ) recent
            LEFT JOIN (
                SELECT DISTINCT buyer_id FROM (${BUYER_TRANSACTIONS_SQL}) t
                WHERE created_at < (NOW() - INTERVAL 30 DAY)
            ) prior ON prior.buyer_id = recent.buyer_id`
        )
    ]);

    return { allTime: allTimeRows[0], period: periodRows[0] };
};

// Provider-retention metrics - the seller/provider-side counterpart of
// buyer retention above. A "provider" here is any seller_profiles user
// who was actually paid for something (a product sale or a service
// booking, whichever - or both, since this platform's stores can do
// either - see docs/ARCHITECTURE_REVIEW.md on how Products/Services
// converge on one seller identity), over trailing 30-day windows:
// currently active, active in the prior 30-day window, and the overlap
// between the two (retained). adminService derives churned/new from
// these three counts rather than this query returning subtraction
// results itself, keeping the SQL to plain counts.
const PROVIDER_ACTIVITY_SQL = `
    SELECT oi.seller_id AS provider_id, o.created_at AS created_at
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid'
    UNION ALL
    SELECT b.provider_id, b.created_at
    FROM bookings b
    WHERE b.payment_status = 'paid'
`;

exports.getProviderRetentionMetrics = async () => {
    const [[currentRows], [priorRows], [retainedRows]] = await Promise.all([
        db.query(
            `SELECT COUNT(DISTINCT provider_id) AS active_current
            FROM (${PROVIDER_ACTIVITY_SQL}) a
            WHERE a.created_at >= (NOW() - INTERVAL 30 DAY)`
        ),
        db.query(
            `SELECT COUNT(DISTINCT provider_id) AS active_prior
            FROM (${PROVIDER_ACTIVITY_SQL}) a
            WHERE a.created_at >= (NOW() - INTERVAL 60 DAY) AND a.created_at < (NOW() - INTERVAL 30 DAY)`
        ),
        db.query(
            `SELECT COUNT(DISTINCT cur.provider_id) AS retained
            FROM (
                SELECT DISTINCT provider_id FROM (${PROVIDER_ACTIVITY_SQL}) a
                WHERE a.created_at >= (NOW() - INTERVAL 30 DAY)
            ) cur
            JOIN (
                SELECT DISTINCT provider_id FROM (${PROVIDER_ACTIVITY_SQL}) a
                WHERE a.created_at >= (NOW() - INTERVAL 60 DAY) AND a.created_at < (NOW() - INTERVAL 30 DAY)
            ) prior ON prior.provider_id = cur.provider_id`
        )
    ]);

    return {
        activeCurrent: currentRows[0].active_current,
        activePrior: priorRows[0].active_prior,
        retained: retainedRows[0].retained
    };
};

// Daily GMV series (products + bookings, kept separate per-day so
// adminService can either blend or split them) backing the CSV export
// - reuses the exact same paid/date-window shape as getDailySales /
// getDailyBookingSales above, just over a longer, caller-supplied
// window since a CSV export is expected to cover more than a 14-day
// dashboard chart.
exports.getGmvSeries = async (days) => {
    const [productRows] = await db.query(
        `SELECT DATE(created_at) AS day,
                COALESCE(SUM(total_amount), 0) AS gmv,
                COUNT(*) AS transaction_count
        FROM orders
        WHERE payment_status = 'paid' AND parent_order_id IS NULL AND created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [days]
    );

    const [bookingRows] = await db.query(
        `SELECT DATE(created_at) AS day,
                COALESCE(SUM(amount), 0) AS gmv,
                COUNT(*) AS transaction_count
        FROM bookings
        WHERE payment_status = 'paid' AND created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        [days]
    );

    return { productRows, bookingRows };
};

// Old seller document-verification review queries lived here
// (findPendingVerifications / findVerificationDocuments /
// setSellerVerificationStatus) - removed along with
// seller_verification_documents (migration 029); see accountVerification
// module for the centralized replacement.

// Active users (Revenue & Product Enhancements roadmap) - DAU/WAU/MAU
// off users.last_active_at (076), broken down by role. This measures
// platform activity broadly (anyone making an authenticated request),
// distinct from getBuyerRetentionMetrics/getProviderRetentionMetrics
// above which only count users who actually transacted.
exports.getActiveUsersMetrics = async () => {
    const [rows] = await db.query(
        `SELECT
            role,
            COALESCE(SUM(last_active_at >= (NOW() - INTERVAL 1 DAY)), 0) AS dau,
            COALESCE(SUM(last_active_at >= (NOW() - INTERVAL 7 DAY)), 0) AS wau,
            COALESCE(SUM(last_active_at >= (NOW() - INTERVAL 30 DAY)), 0) AS mau
        FROM users
        WHERE role IN ('buyer', 'seller', 'delivery_agent', 'admin')
        GROUP BY role`
    );
    return rows;
};

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

// token_version bump invalidates every session token issued before this
// permission change - see auth.middleware.js and account.repository.js
// #updatePassword for the same pattern. Without this, a JWT issued
// before a demotion still carries the OLD admin_level claim (auth.
// middleware.js never re-reads role/admin_level fresh from the DB, only
// is_active/suspended_at/token_version), so a demoted super_admin would
// otherwise keep super-admin access via their existing token for up to
// its remaining 7-day life.
exports.updateAdminLevel = async (userId, adminLevel) => {
    await db.query(
        "UPDATE users SET admin_level = ?, token_version = token_version + 1 WHERE id = ? AND role = 'admin'",
        [adminLevel, userId]
    );
};

// Revokes admin access rather than hard-deleting the account, so audit
// trails (who approved what) stay intact. Also bumps token_version (see
// updateAdminLevel's comment above) - without it, a removed admin's
// existing JWT still carries `role: "admin"` and would keep passing
// authorize("admin") on every admin-only route until the token's
// natural 7-day expiry, even though the DB row is no longer an admin.
exports.revokeAdmin = async (userId) => {
    await db.query(
        "UPDATE users SET role = 'buyer', admin_level = NULL, token_version = token_version + 1 WHERE id = ? AND role = 'admin'",
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

// --- Phase A5 (Advanced Analytics) -------------------------------------
//
// Three additions beyond getAnalytics/getServicesAnalytics/getBusinessMetrics
// above: period-over-period comparison (this week vs last week, and the
// 30-day rolling equivalent of month-over-month), a platform-wide top-
// customers breakdown (blended across orders + bookings, same pattern
// getBusinessMetrics already uses for GMV), and an admin-only seller
// performance leaderboard blending each seller's product revenue with
// their service revenue where a merchant sells both.
//
// Rolling windows (last 7 days vs the 7 days before that; last 30 vs the
// 30 before that) rather than calendar week/month boundaries - this
// matches every other "Nd" window already in this file (gmv_7d/gmv_30d
// in getGmvBreakdown, DAYS/REGRESSION_WINDOW_DAYS in getAnalytics), so a
// week/month here means the same thing it means everywhere else in this
// dashboard.

// Blended (products + bookings) GMV and transaction count for a single
// [start, end) window. Shared by getPeriodComparison's four windows so
// the "paid orders + paid bookings, summed" definition only lives once.
async function getBlendedTotalsForWindow(start, end) {
    const [[row]] = await db.query(
        `SELECT
            (SELECT COALESCE(SUM(total_amount), 0) FROM orders
                WHERE payment_status = 'paid' AND parent_order_id IS NULL
                AND created_at >= ? AND created_at < ?) AS product_gmv,
            (SELECT COUNT(*) FROM orders
                WHERE payment_status = 'paid' AND parent_order_id IS NULL
                AND created_at >= ? AND created_at < ?) AS product_count,
            (SELECT COALESCE(SUM(amount), 0) FROM bookings
                WHERE payment_status = 'paid'
                AND created_at >= ? AND created_at < ?) AS booking_gmv,
            (SELECT COUNT(*) FROM bookings
                WHERE payment_status = 'paid'
                AND created_at >= ? AND created_at < ?) AS booking_count`,
        [start, end, start, end, start, end, start, end]
    );

    return {
        gmv: (Number(row.product_gmv) || 0) + (Number(row.booking_gmv) || 0),
        transactionCount: (Number(row.product_count) || 0) + (Number(row.booking_count) || 0)
    };
}

// Phase P8 (Analytics Visualization) - optional third window, a
// user-picked [start, end) custom range, compared against the
// immediately-preceding window of the same duration (same "current vs.
// prior period of equal length" shape as the week/month windows above -
// just with a caller-supplied duration instead of a fixed 7/30 days).
exports.getPeriodComparison = async (customRange) => {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const daysAgo = (n) => new Date(now.getTime() - n * dayMs);

    const fixedWindows = [
        getBlendedTotalsForWindow(daysAgo(7), now),
        getBlendedTotalsForWindow(daysAgo(14), daysAgo(7)),
        getBlendedTotalsForWindow(daysAgo(30), now),
        getBlendedTotalsForWindow(daysAgo(60), daysAgo(30))
    ];

    let customWindows = null;
    if (customRange && customRange.start && customRange.end) {
        const { start, end } = customRange;
        const durationMs = end.getTime() - start.getTime();
        const previousStart = new Date(start.getTime() - durationMs);
        customWindows = Promise.all([
            getBlendedTotalsForWindow(start, end),
            getBlendedTotalsForWindow(previousStart, start)
        ]);
    }

    const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all(fixedWindows);
    const result = { thisWeek, lastWeek, thisMonth, lastMonth };

    if (customWindows) {
        const [current, previous] = await customWindows;
        result.custom = { current, previous };
    }

    return result;
};

// Platform-wide top customers by total spend, blended across paid
// orders (as buyer) and paid bookings (as customer) - same buyer can
// show up via either or both, so this outer-joins both aggregates onto
// users rather than unioning two separate top-N lists.
exports.getTopCustomers = async (limit) => {
    const [rows] = await db.query(
        `SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email,
                COALESCE(o.order_spend, 0) + COALESCE(b.booking_spend, 0) AS total_spend,
                COALESCE(o.order_count, 0) + COALESCE(b.booking_count, 0) AS transaction_count
        FROM users u
        LEFT JOIN (
            SELECT buyer_id, SUM(total_amount) AS order_spend, COUNT(*) AS order_count
            FROM orders
            WHERE payment_status = 'paid' AND parent_order_id IS NULL
            GROUP BY buyer_id
        ) o ON o.buyer_id = u.id
        LEFT JOIN (
            SELECT customer_id, SUM(amount) AS booking_spend, COUNT(*) AS booking_count
            FROM bookings
            WHERE payment_status = 'paid'
            GROUP BY customer_id
        ) b ON b.customer_id = u.id
        WHERE o.buyer_id IS NOT NULL OR b.customer_id IS NOT NULL
        ORDER BY total_spend DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// Admin-only, platform-wide: every seller_profiles row ranked by
// blended revenue (product sales via order_items + service bookings via
// bookings.provider_id) - a hybrid merchant's two revenue streams land
// on the same leaderboard row instead of splitting them across the
// separate getTopSellers/getTopProviders lists above.
exports.getSellerLeaderboard = async (limit) => {
    const [rows] = await db.query(
        `SELECT sp.user_id, sp.store_name, sp.is_verified, sp.country,
                COALESCE(p.product_revenue, 0) AS product_revenue,
                COALESCE(s.service_revenue, 0) AS service_revenue,
                COALESCE(p.product_revenue, 0) + COALESCE(s.service_revenue, 0) AS total_revenue,
                COALESCE(p.product_orders, 0) AS product_orders,
                COALESCE(s.service_bookings, 0) AS service_bookings,
                COALESCE(p.product_orders, 0) + COALESCE(s.service_bookings, 0) AS total_transactions
        FROM seller_profiles sp
        LEFT JOIN (
            SELECT oi.seller_id,
                    SUM(oi.subtotal) AS product_revenue,
                    COUNT(DISTINCT oi.order_id) AS product_orders
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.payment_status = 'paid'
            GROUP BY oi.seller_id
        ) p ON p.seller_id = sp.user_id
        LEFT JOIN (
            SELECT b.provider_id,
                    SUM(b.amount) AS service_revenue,
                    COUNT(*) AS service_bookings
            FROM bookings b
            WHERE b.payment_status = 'paid'
            GROUP BY b.provider_id
        ) s ON s.provider_id = sp.user_id
        WHERE p.seller_id IS NOT NULL OR s.provider_id IS NOT NULL
        ORDER BY total_revenue DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};
