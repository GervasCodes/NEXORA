const db = require("../../config/db");
const trade = require("../stock/stock.trade");

// Seller POS (Phase 7) - stock-adjustment ledger + off-platform sales.
// See migration 144 for the schema reasoning. Everything that moves
// stock takes a caller-supplied transaction `connection` so the row lock,
// the stock change and the ledger insert commit (or roll back) together.

exports.findAdjustmentByKey = async (sellerId, key, connection = db) => {
    const [rows] = await connection.query(
        "SELECT * FROM stock_adjustments WHERE seller_id = ? AND idempotency_key = ?",
        [sellerId, key]
    );
    return rows[0];
};

exports.findOfflineSaleById = async (sellerId, id, connection = db) => {
    const [rows] = await connection.query(
        "SELECT * FROM offline_sales WHERE id = ? AND seller_id = ?",
        [id, sellerId]
    );
    return rows[0];
};

// Locks the product row. Ownership is part of the WHERE so a seller can
// never lock (let alone change) someone else's product. Drafts are not
// real listings yet and are excluded.
exports.lockOwnedProduct = async (connection, sellerId, productId) => {
    const [rows] = await connection.query(
        `SELECT id, name, slug, price, discount_price, stock, has_variants
         FROM products
         WHERE id = ? AND seller_id = ? AND is_draft = FALSE
         FOR UPDATE`,
        [productId, sellerId]
    );
    return rows[0];
};

exports.lockVariant = async (connection, productId, variantId) => {
    const [rows] = await connection.query(
        `SELECT id, product_id, options, price_delta, stock
         FROM product_variants
         WHERE id = ? AND product_id = ?
         FOR UPDATE`,
        [variantId, productId]
    );
    return rows[0];
};

exports.insertOfflineSale = async (connection, sale) => {
    const [result] = await connection.query(
        `INSERT INTO offline_sales
            (seller_id, product_id, variant_id, product_name, variant_label, quantity,
             unit_price, total_amount, payment_method, customer_name, note, sold_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            sale.sellerId, sale.productId, sale.variantId || null, sale.productName,
            sale.variantLabel || null, sale.quantity, sale.unitPrice, sale.totalAmount,
            sale.paymentMethod, sale.customerName || null, sale.note || null, sale.soldAt
        ]
    );
    return result.insertId;
};

exports.insertAdjustment = async (connection, adj) => {
    const [result] = await connection.query(
        `INSERT INTO stock_adjustments
            (seller_id, product_id, variant_id, type, quantity_change, stock_before,
             stock_after, reason, offline_sale_id, idempotency_key, payload_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            adj.sellerId, adj.productId, adj.variantId || null, adj.type, adj.quantityChange,
            adj.stockBefore, adj.stockAfter, adj.reason || null, adj.offlineSaleId || null,
            adj.idempotencyKey || null, adj.payloadHash || null
        ]
    );
    return result.insertId;
};

exports.findAdjustmentById = async (id, connection = db) => {
    const [rows] = await connection.query("SELECT * FROM stock_adjustments WHERE id = ?", [id]);
    return rows[0];
};

exports.listAdjustments = async (sellerId, { productId, type, limit, offset }) => {
    const conditions = ["a.seller_id = ?"];
    const params = [sellerId];
    if (productId) { conditions.push("a.product_id = ?"); params.push(productId); }
    if (type) { conditions.push("a.type = ?"); params.push(type); }
    const where = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT a.*, p.name AS product_name
         FROM stock_adjustments a
         JOIN products p ON p.id = a.product_id
         WHERE ${where}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM stock_adjustments a WHERE ${where}`,
        params
    );
    return { rows, total };
};

exports.listOfflineSales = async (sellerId, { productId, from, to, limit, offset }) => {
    const conditions = ["seller_id = ?"];
    const params = [sellerId];
    if (productId) { conditions.push("product_id = ?"); params.push(productId); }
    if (from) { conditions.push("sold_at >= ?"); params.push(from); }
    if (to) { conditions.push("sold_at <= ?"); params.push(to); }
    const where = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT * FROM offline_sales WHERE ${where}
         ORDER BY sold_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total, revenue }]] = await db.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(total_amount), 0) AS revenue
         FROM offline_sales WHERE ${where}`,
        params
    );
    return { rows, total, revenue: Number(revenue) };
};

// ---------------------------------------------------------------------
// Phase 8 - read models for the seller POS screens.
// ---------------------------------------------------------------------

// Current stock per product. A product with variants keeps its stock on
// product_variants (products.stock isn't maintained for it), so its
// figure is the sum over ACTIVE variants and "low" is judged on its
// lowest active variant - one sold-out size is worth flagging even if the
// others are plentiful. Drafts are excluded (not real listings yet).
const STOCK_FROM = `
    FROM products p
    LEFT JOIN stock_items sl ON sl.legacy_product_id = p.id
    LEFT JOIN (
        SELECT product_id, SUM(stock) AS total_stock, MIN(stock) AS min_stock
        FROM product_variants
        WHERE is_active = 1
        GROUP BY product_id
    ) v ON v.product_id = p.id
    WHERE p.seller_id = ? AND p.is_draft = FALSE`;

// A tools-only product migrated to an external item (migration 157) keeps its live
// stock on the item (sl), not on the old hidden product row.
const STOCK_TOTAL = "CASE WHEN sl.id IS NOT NULL THEN sl.stock WHEN p.has_variants THEN COALESCE(v.total_stock, 0) ELSE p.stock END";
const STOCK_LOW_BASIS = "CASE WHEN sl.id IS NOT NULL THEN sl.stock WHEN p.has_variants THEN COALESCE(v.min_stock, 0) ELSE p.stock END";
// One low-stock rule: each item's own reorder_level (default 5). An explicit
// ?threshold= from the screen still overrides it for that request.
const REORDER_LEVEL = "COALESCE(sl.reorder_level, (SELECT si.reorder_level FROM stock_items si WHERE si.link_key = CONCAT(p.id, '-0')), ?)";

exports.listStockLevels = async (sellerId, { search, lowOnly, threshold, defaultLevel = 5, limit, offset }) => {
    const conditions = [];
    const params = [sellerId];
    if (search) {
        conditions.push("p.name LIKE ?");
        params.push(`%${search}%`);
    }
    if (lowOnly) {
        if (threshold === null) {
            conditions.push(`${STOCK_LOW_BASIS} <= ${REORDER_LEVEL}`);
            params.push(defaultLevel);
        } else {
            conditions.push(`${STOCK_LOW_BASIS} <= ?`);
            params.push(threshold);
        }
    }
    const extra = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, p.is_active, p.has_variants, p.price, p.discount_price,
                (
                    SELECT pi.image_url FROM product_images pi
                    WHERE pi.product_id = p.id
                    ORDER BY pi.is_primary DESC, pi.display_order, pi.id
                    LIMIT 1
                ) AS image_url,
                ${STOCK_TOTAL} AS stock_total
         ${STOCK_FROM}${extra}
         ORDER BY ${STOCK_LOW_BASIS} ASC, p.name ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total ${STOCK_FROM}${extra}`,
        params
    );
    return { rows, total };
};

exports.getStockSummary = async (sellerId, threshold, defaultLevel = 5) => {
    const lowExpr = threshold === null ? REORDER_LEVEL : "?";
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS products,
                COALESCE(SUM(CASE WHEN ${STOCK_LOW_BASIS} <= ${lowExpr} THEN 1 ELSE 0 END), 0) AS low_stock,
                COALESCE(SUM(CASE WHEN ${STOCK_TOTAL} = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock
         ${STOCK_FROM}`,
        [threshold === null ? defaultLevel : threshold, sellerId]
    );
    return row;
};

exports.findActiveVariantsForProducts = async (productIds) => {
    if (!productIds.length) return [];
    const [rows] = await db.query(
        `SELECT id, product_id, options, sku, price_delta, stock
         FROM product_variants
         WHERE product_id IN (?) AND is_active = 1
         ORDER BY id`,
        [productIds]
    );
    return rows;
};

// On-platform sales = this seller's order items on orders that weren't
// cancelled (a cancelled order's stock goes back, so it isn't a sale).
// Note this is intentionally NOT identical to the Analytics page's gross
// sales, which counts every order item regardless of status.
const ON_PLATFORM_FROM = `
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.seller_id = ? AND o.status <> 'cancelled'
      AND o.created_at >= ? AND o.created_at < ?`;

exports.onPlatformTotals = async (sellerId, range) => {
    const [[row]] = await db.query(
        `SELECT COUNT(DISTINCT oi.order_id) AS sales_count,
                COALESCE(SUM(oi.quantity), 0) AS units,
                COALESCE(SUM(oi.subtotal), 0) AS revenue
         ${ON_PLATFORM_FROM}`,
        [sellerId, range.start, range.endExclusive]
    );
    return row;
};

exports.onPlatformDaily = async (sellerId, range) => {
    const [rows] = await db.query(
        `SELECT ${trade.darDaySql("o.created_at")} AS day, SUM(oi.subtotal) AS revenue
         ${ON_PLATFORM_FROM}
         GROUP BY day`,
        [sellerId, range.start, range.endExclusive]
    );
    return rows;
};

exports.onPlatformByProduct = async (sellerId, range) => {
    const [rows] = await db.query(
        `SELECT oi.product_id, SUM(oi.quantity) AS units, SUM(oi.subtotal) AS revenue
         ${ON_PLATFORM_FROM}
         GROUP BY oi.product_id`,
        [sellerId, range.start, range.endExclusive]
    );
    return rows;
};

const OFFLINE_WHERE = "seller_id = ? AND sold_at >= ? AND sold_at < ?";

exports.offlineTotals = async (sellerId, range) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS sales_count,
                COALESCE(SUM(quantity), 0) AS units,
                COALESCE(SUM(total_amount), 0) AS revenue
         FROM offline_sales WHERE ${OFFLINE_WHERE}`,
        [sellerId, range.start, range.endExclusive]
    );
    return row;
};

exports.offlineDaily = async (sellerId, range) => {
    const [rows] = await db.query(
        `SELECT ${trade.darDaySql("sold_at", "datetime")} AS day, SUM(total_amount) AS revenue
         FROM offline_sales WHERE ${OFFLINE_WHERE}
         GROUP BY day`,
        [sellerId, range.start, range.endExclusive]
    );
    return rows;
};

exports.offlineByProduct = async (sellerId, range) => {
    const [rows] = await db.query(
        `SELECT product_id, MAX(product_name) AS product_name,
                SUM(quantity) AS units, SUM(total_amount) AS revenue
         FROM offline_sales WHERE ${OFFLINE_WHERE}
         GROUP BY product_id`,
        [sellerId, range.start, range.endExclusive]
    );
    return rows;
};

exports.findProductNames = async (productIds) => {
    if (!productIds.length) return [];
    const [rows] = await db.query("SELECT id, name FROM products WHERE id IN (?)", [productIds]);
    return rows;
};

// ---------------------------------------------------------------------
// Phase 10 - inventory items for business-tools-only accounts.
// Stored as ordinary products rows, forced inactive (is_active = FALSE) so
// no marketplace query ever returns them; on conversion they are simply the
// seller's inactive products. Not drafts (is_draft = FALSE) so the POS
// stock list and sale form see them like any other product.
// ---------------------------------------------------------------------

exports.insertHiddenItem = async ({ sellerId, name, slug, price }) => {
    const [result] = await db.query(
        `INSERT INTO products (seller_id, category_id, name, slug, price, stock, is_active, is_draft)
         VALUES (?, NULL, ?, ?, ?, 0, FALSE, FALSE)`,
        [sellerId, name, slug, price]
    );
    // The stock lives on a matching external item (migration 157).
    await db.query(
        `INSERT IGNORE INTO stock_items (seller_id, legacy_product_id, source, name, sell_price, stock)
         VALUES (?, ?, 'external', ?, ?, 0)`,
        [sellerId, result.insertId, name, price]
    );
    return result.insertId;
};

exports.updateItem = async (sellerId, productId, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return 0;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    const [result] = await db.query(
        `UPDATE products SET ${sets} WHERE id = ? AND seller_id = ? AND is_draft = FALSE`,
        [...keys.map((k) => fields[k]), productId, sellerId]
    );
    if (result.affectedRows) {
        const itemSets = [];
        const itemParams = [];
        if (fields.name !== undefined) { itemSets.push("name = ?"); itemParams.push(fields.name); }
        if (fields.price !== undefined) { itemSets.push("sell_price = ?"); itemParams.push(fields.price); }
        if (itemSets.length) {
            await db.query(
                `UPDATE stock_items SET ${itemSets.join(", ")} WHERE legacy_product_id = ? AND seller_id = ?`,
                [...itemParams, productId, sellerId]
            );
        }
    }
    return result.affectedRows;
};

exports.findItem = async (sellerId, productId) => {
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.slug, p.price, COALESCE(sl.stock, p.stock) AS stock, p.is_active
         FROM products p
         LEFT JOIN stock_items sl ON sl.legacy_product_id = p.id
         WHERE p.id = ? AND p.seller_id = ? AND p.is_draft = FALSE`,
        [productId, sellerId]
    );
    return rows[0];
};
