const crypto = require("crypto");
const db = require("../../config/db");
const { DEFAULT_REORDER_LEVEL } = require("../../config/stock");

// Nexora Stock Management - the single place a stock number changes (Phase 6).
//
// Every function takes a caller-supplied transaction `connection` so the row
// lock, the stock change and the ledger row commit or roll back together.
//
// Where the live number lives (see migration 157):
//   * a marketplace listing  -> products.stock / product_variants.stock
//                               (checkout reads and locks it there)
//   * an external item       -> stock_items.stock
// Lock order is always product -> variant -> item, matching checkout.
//
// Changes are RELATIVE deltas applied under the row lock (stock = stock + ?),
// never "write the number the form last showed", so a sale that lands while a
// seller is editing is not wiped out.

const fail = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};
exports.fail = fail;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// Stable hash of the fields that define a request, so an idempotency key can be
// checked against the body and not only against itself.
exports.hashPayload = (payload) => {
    const keys = Object.keys(payload || {}).sort();
    return sha256(JSON.stringify(keys.map((k) => [k, payload[k] === undefined ? null : payload[k]])));
};

exports.linkKey = (productId, variantId) => `${productId}-${variantId || 0}`;

const toInt = (value) => Number(value) || 0;

// ---------------------------------------------------------------- items

const ITEM_COLUMNS = "id, seller_id, product_id, variant_id, link_key, legacy_product_id, source, name, sku, barcode, unit, cost_price, sell_price, reorder_level, stock, is_archived";

exports.findItem = async (connection, sellerId, itemId, { lock = false } = {}) => {
    const [rows] = await connection.query(
        `SELECT ${ITEM_COLUMNS} FROM stock_items WHERE id = ? AND seller_id = ?${lock ? " FOR UPDATE" : ""}`,
        [itemId, sellerId]
    );
    return rows[0];
};

const findItemByLink = async (connection, key) => {
    const [rows] = await connection.query(`SELECT ${ITEM_COLUMNS} FROM stock_items WHERE link_key = ?`, [key]);
    return rows[0];
};

const findLegacyItem = async (connection, sellerId, productId, { lock = false } = {}) => {
    const [rows] = await connection.query(
        `SELECT ${ITEM_COLUMNS} FROM stock_items WHERE legacy_product_id = ? AND seller_id = ?${lock ? " FOR UPDATE" : ""}`,
        [productId, sellerId]
    );
    return rows[0];
};

const insertOpening = async (connection, sellerId, itemId, stock, createdBy) => {
    if (!(stock > 0)) return;
    await connection.query(
        `INSERT INTO stock_movements
            (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, reason, created_by)
         VALUES (?, ?, 'opening', ?, 0, ?, 'listing', 'Opening balance when the item was added', ?)`,
        [sellerId, itemId, stock, stock, createdBy || null]
    );
};

// Plain (non-locking) lookup first: INSERT IGNORE on an existing key would take
// a shared lock on it and could deadlock with a concurrent FOR UPDATE.
exports.ensureListingItem = async (connection, { sellerId, product, variant, currentStock, createdBy }) => {
    const key = exports.linkKey(product.id, variant ? variant.id : null);
    const existing = await findItemByLink(connection, key);
    if (existing) return existing;

    const price = Number(product.price || 0) + (variant ? Number(variant.price_delta || 0) : 0);
    await connection.query(
        `INSERT IGNORE INTO stock_items
            (seller_id, product_id, variant_id, link_key, source, name, sku, sell_price, reorder_level, stock)
         VALUES (?, ?, ?, ?, 'nexora', ?, ?, ?, ?, 0)`,
        [
            sellerId, product.id, variant ? variant.id : null, key, product.name,
            variant && variant.sku ? String(variant.sku).slice(0, 64) : null,
            price, DEFAULT_REORDER_LEVEL
        ]
    );
    const item = await findItemByLink(connection, key);
    await insertOpening(connection, sellerId, item.id, toInt(currentStock), createdBy);
    return item;
};

// ---------------------------------------------------------------- locking

const lockOwnedProduct = async (connection, sellerId, productId) => {
    const [rows] = await connection.query(
        `SELECT id, name, slug, price, discount_price, stock, has_variants
         FROM products WHERE id = ? AND seller_id = ? AND is_draft = FALSE FOR UPDATE`,
        [productId, sellerId]
    );
    return rows[0];
};

const lockVariant = async (connection, productId, variantId) => {
    const [rows] = await connection.query(
        `SELECT id, product_id, options, sku, price_delta, stock
         FROM product_variants WHERE id = ? AND product_id = ? FOR UPDATE`,
        [variantId, productId]
    );
    return rows[0];
};

// Locks whatever holds the live number for a listing/product reference and
// returns a target. A tools-only hidden product resolves to its external item.
exports.lockByProduct = async (connection, sellerId, productId, variantId, { createdBy } = {}) => {
    const product = await lockOwnedProduct(connection, sellerId, productId);
    if (!product) throw fail("Product not found.", 404);

    const legacy = await findLegacyItem(connection, sellerId, productId, { lock: true });
    if (legacy) {
        if (variantId) throw fail("This product has no variants.");
        return { kind: "item", product, variant: null, item: legacy, stock: toInt(legacy.stock) };
    }

    if (product.has_variants) {
        if (!variantId) throw fail("This product has variants - choose which variant to update.");
        const variant = await lockVariant(connection, product.id, variantId);
        if (!variant) throw fail("Variant not found for this product.", 404);
        const item = await exports.ensureListingItem(connection, {
            sellerId, product, variant, currentStock: variant.stock, createdBy
        });
        return { kind: "variant", product, variant, item, stock: toInt(variant.stock) };
    }

    if (variantId) throw fail("This product has no variants.");
    const item = await exports.ensureListingItem(connection, {
        sellerId, product, variant: null, currentStock: product.stock, createdBy
    });
    return { kind: "product", product, variant: null, item, stock: toInt(product.stock) };
};

// Locks by stock item id (the Nexora Stock Management screens).
exports.lockByItem = async (connection, sellerId, itemId, opts = {}) => {
    const probe = await exports.findItem(connection, sellerId, itemId);
    if (!probe) throw fail("Item not found.", 404);

    if (probe.source === "nexora" && probe.product_id) {
        const target = await exports.lockByProduct(connection, sellerId, probe.product_id, probe.variant_id, opts);
        // Re-read the item: it may have changed while we waited for the product lock.
        target.item = await exports.findItem(connection, sellerId, itemId);
        return target;
    }
    const item = await exports.findItem(connection, sellerId, itemId, { lock: true });
    return { kind: "item", product: null, variant: null, item, stock: toInt(item.stock) };
};

// ---------------------------------------------------------------- idempotency

// Returns the earlier movement for this key, or null. Same key with a
// different body is a client bug: refuse instead of silently replaying.
exports.checkIdempotency = async (connection, sellerId, key, payloadHash) => {
    if (!key) return null;
    const [rows] = await connection.query(
        "SELECT * FROM stock_movements WHERE seller_id = ? AND idempotency_key = ? LIMIT 1",
        [sellerId, key]
    );
    const existing = rows[0];
    if (!existing) return null;
    if (existing.payload_hash && payloadHash && existing.payload_hash !== payloadHash) {
        throw fail("This request id was already used for a different change. Reload and try again.", 409);
    }
    return existing;
};

// ---------------------------------------------------------------- applying

// Applies a signed delta to a locked target and writes the ledger row.
exports.applyDelta = async (connection, target, delta, meta = {}) => {
    const change = Number(delta);
    if (!Number.isInteger(change)) throw fail("Quantity must be a whole number.");
    const before = target.stock;
    const after = before + change;
    if (after < 0 && !meta.allowNegative) {
        throw fail(`Not enough stock - only ${before} in stock.`, 409);
    }

    if (change !== 0) {
        if (target.kind === "variant") {
            await connection.query("UPDATE product_variants SET stock = stock + ? WHERE id = ?", [change, target.variant.id]);
        } else if (target.kind === "product") {
            await connection.query("UPDATE products SET stock = stock + ? WHERE id = ?", [change, target.product.id]);
        } else {
            await connection.query("UPDATE stock_items SET stock = stock + ? WHERE id = ?", [change, target.item.id]);
        }
    }

    const [result] = await connection.query(
        `INSERT INTO stock_movements
            (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, unit_cost,
             ref_type, ref_id, reason, idempotency_key, payload_hash, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            target.item.seller_id, target.item.id, meta.type, change, before, after,
            meta.unitCost === undefined ? null : meta.unitCost,
            meta.refType || null, meta.refId || null, meta.reason || null,
            meta.idempotencyKey || null, meta.payloadHash || null, meta.createdBy || null
        ]
    );
    target.stock = after;
    return { movementId: result.insertId, stockBefore: before, stockAfter: after, quantityChange: change };
};

// "Set the stock to N" as a locked relative delta. `baseline` is the number the
// seller's form was showing; when given, only the seller's own change
// (new - baseline) is applied on top of whatever is there now.
exports.setStock = async (connection, target, newStock, { baseline, ...meta } = {}) => {
    const wanted = Number(newStock);
    if (!Number.isInteger(wanted) || wanted < 0) throw fail("Stock must be a whole number, zero or more.");
    const from = baseline === undefined || baseline === null || baseline === "" ? target.stock : Number(baseline);
    if (!Number.isInteger(from)) throw fail("Invalid stock baseline.");
    const delta = wanted - from;
    if (delta === 0) return null;
    return exports.applyDelta(connection, target, delta, { type: "correction", ...meta });
};

// ---------------------------------------------------------------- orders

// Ledger rows for a checkout deduction / cancellation restore. Called AFTER the
// stock UPDATE in the same transaction, so the live numbers are the "after"
// figures (deduct) or "after" figures (restore) and before is derived.
// rows: [{ order_id, seller_id, product_id, variant_id, quantity }]
exports.recordOrderMovements = async (connection, rows, type) => {
    if (!rows.length) return;
    const sign = type === "order_deduct" ? -1 : 1;
    const keyOf = (r) => exports.linkKey(r.product_id, r.variant_id);

    const keys = [...new Set(rows.map(keyOf))];
    const [existingItems] = await connection.query(
        "SELECT id, link_key FROM stock_items WHERE link_key IN (?)", [keys]
    );
    const itemByKey = new Map(existingItems.map((i) => [i.link_key, i.id]));

    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const variantIds = [...new Set(rows.filter((r) => r.variant_id).map((r) => r.variant_id))];
    const [products] = await connection.query(
        "SELECT id, seller_id, name, price, stock FROM products WHERE id IN (?)", [productIds]
    );
    const productById = new Map(products.map((p) => [p.id, p]));
    let variantById = new Map();
    if (variantIds.length) {
        const [variants] = await connection.query(
            "SELECT id, product_id, sku, price_delta, stock FROM product_variants WHERE id IN (?)", [variantIds]
        );
        variantById = new Map(variants.map((v) => [v.id, v]));
    }

    const liveStock = (r) => toInt(r.variant_id ? (variantById.get(r.variant_id) || {}).stock : (productById.get(r.product_id) || {}).stock);

    // Group per listing so before/after chain correctly across several rows.
    const groups = new Map();
    rows.forEach((r) => {
        const key = keyOf(r);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    });

    const movementRows = [];
    for (const [key, group] of groups) {
        const first = group[0];
        const product = productById.get(first.product_id);
        if (!product) continue;
        const total = group.reduce((s, r) => s + toInt(r.quantity), 0);
        const after = liveStock(first);
        const start = after - sign * total; // stock before the first row

        let itemId = itemByKey.get(key);
        if (!itemId) {
            const variant = first.variant_id ? variantById.get(first.variant_id) : null;
            const item = await exports.ensureListingItem(connection, {
                sellerId: product.seller_id, product, variant, currentStock: 0
            });
            itemId = item.id;
            await insertOpening(connection, product.seller_id, itemId, start, null);
        }

        let running = start;
        for (const r of group) {
            const qty = toInt(r.quantity);
            const next = running + sign * qty;
            movementRows.push([
                r.seller_id || product.seller_id, itemId, type, sign * qty, running, next,
                "order", r.order_id,
                type === "order_deduct" ? "Sold on Nexora" : "Order cancelled - stock restored"
            ]);
            running = next;
        }
    }

    if (movementRows.length) {
        await connection.query(
            `INSERT INTO stock_movements
                (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, ref_id, reason)
             VALUES ?`,
            [movementRows]
        );
    }
};

exports.withTransaction = async (work) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
