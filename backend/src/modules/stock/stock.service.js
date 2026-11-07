const db = require("../../config/db");
const stockLedger = require("./stock.ledger");
const settingsService = require("../settings/settings.service");
const productAlertService = require("../productAlert/productAlert.service");
const auditService = require("../audit/audit.service");
const { fail } = stockLedger;
const { MAX_STOCK } = require("../../config/stock");

// Nexora Stock Management (Phase 6): items (Nexora-listed or external) and the
// movement ledger. The live number of a Nexora-listed item stays on
// products / product_variants; see stock.ledger.js and migration 157.

const isDuplicateKeyError = (error) => error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);

const money = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw fail("Amounts must be zero or more.");
    return Math.round(n * 100) / 100;
};

const clean = (v, max) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = String(v).trim();
    return t === "" ? null : t.slice(0, max);
};

const formatVariantLabel = (options) => {
    if (!options) return null;
    let parsed = options;
    if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch (_) { return parsed; }
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.values(parsed).filter(Boolean).join(" / ") || null;
    }
    return null;
};

const pageParams = (query) => {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    return { limit, page, offset: (page - 1) * limit };
};

// ---------------------------------------------------------------- sync

// Makes sure every published listing (and active variant) of this seller has an
// item. New listings are normally picked up lazily at their first stock change;
// this catches the rest so the list is complete. Cheap: one anti-join.
exports.syncListingItems = async (sellerId) => {
    const defaultLevel = await settingsService.getStockDefaultReorderLevel();
    const [[{ missing }]] = await db.query(
        `SELECT (
            SELECT COUNT(*) FROM products p
             WHERE p.seller_id = ? AND p.is_draft = 0 AND p.has_variants = 0
               AND NOT EXISTS (SELECT 1 FROM stock_items si WHERE si.link_key = CONCAT(p.id, '-0'))
               AND NOT EXISTS (SELECT 1 FROM stock_items sl WHERE sl.legacy_product_id = p.id)
         ) + (
            SELECT COUNT(*) FROM products p JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
             WHERE p.seller_id = ? AND p.is_draft = 0 AND p.has_variants = 1
               AND NOT EXISTS (SELECT 1 FROM stock_items si WHERE si.link_key = CONCAT(p.id, '-', v.id))
         ) AS missing`,
        [sellerId, sellerId]
    );
    if (!Number(missing)) return 0;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(
            `INSERT IGNORE INTO stock_items (seller_id, product_id, variant_id, link_key, source, name, sell_price, reorder_level, stock)
             SELECT p.seller_id, p.id, NULL, CONCAT(p.id, '-0'), 'nexora', p.name, p.price, ?, 0
             FROM products p
             WHERE p.seller_id = ? AND p.is_draft = 0 AND p.has_variants = 0
               AND NOT EXISTS (SELECT 1 FROM stock_items sl WHERE sl.legacy_product_id = p.id)`,
            [defaultLevel, sellerId]
        );
        await connection.query(
            `INSERT IGNORE INTO stock_items (seller_id, product_id, variant_id, link_key, source, name, sku, sell_price, reorder_level, stock)
             SELECT p.seller_id, p.id, v.id, CONCAT(p.id, '-', v.id), 'nexora', p.name, LEFT(v.sku, 64),
                    p.price + COALESCE(v.price_delta, 0), ?, 0
             FROM products p JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
             WHERE p.seller_id = ? AND p.is_draft = 0 AND p.has_variants = 1`,
            [defaultLevel, sellerId]
        );
        // Opening balance for the items just created.
        await connection.query(
            `INSERT INTO stock_movements
                (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, reason)
             SELECT si.seller_id, si.id, 'opening', COALESCE(v.stock, p.stock), 0, COALESCE(v.stock, p.stock),
                    'listing', 'Opening balance when the item was added'
             FROM stock_items si
             LEFT JOIN products p ON p.id = si.product_id
             LEFT JOIN product_variants v ON v.id = si.variant_id
             WHERE si.seller_id = ? AND si.source = 'nexora' AND si.product_id IS NOT NULL
               AND COALESCE(v.stock, p.stock) > 0
               AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.stock_item_id = si.id)`,
            [sellerId]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
    return Number(missing);
};

// ---------------------------------------------------------------- read

const ITEM_SELECT = `
    SELECT si.id, si.source, si.product_id, si.variant_id, si.name, si.sku, si.barcode, si.unit,
           si.cost_price, si.reorder_level, si.is_archived, si.created_at,
           CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL
                THEN COALESCE(v.stock, p.stock) ELSE si.stock END AS stock,
           CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL
                THEN p.price + COALESCE(v.price_delta, 0) ELSE si.sell_price END AS sell_price,
           CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL
                THEN p.name ELSE si.name END AS display_name,
           v.options AS variant_options,
           p.slug AS product_slug, p.is_active AS listing_active, p.is_draft AS listing_draft
    FROM stock_items si
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN product_variants v ON v.id = si.variant_id`;

const shapeItem = (row) => {
    const stock = Number(row.stock);
    const level = Number(row.reorder_level);
    const label = formatVariantLabel(row.variant_options);
    return {
        id: row.id,
        source: row.source === "nexora" && row.product_id ? "nexora" : "external",
        product_id: row.product_id,
        variant_id: row.variant_id,
        name: row.display_name,
        variant_label: label,
        sku: row.sku,
        barcode: row.barcode,
        unit: row.unit,
        cost_price: row.cost_price === null ? null : Number(row.cost_price),
        sell_price: Number(row.sell_price),
        reorder_level: level,
        stock,
        is_low: stock > 0 && stock <= level,
        is_out: stock <= 0,
        is_archived: !!row.is_archived,
        listing_active: row.product_id ? !!row.listing_active : null,
        product_slug: row.product_slug || null
    };
};

exports.listItems = async (sellerId, query) => {
    await exports.syncListingItems(sellerId);
    const { limit, page, offset } = pageParams(query);
    const where = ["si.seller_id = ?"];
    const params = [sellerId];

    where.push("si.is_archived = ?");
    params.push(query.archived === "1" || query.archived === "true" ? 1 : 0);

    if (query.source === "nexora") where.push("si.source = 'nexora' AND si.product_id IS NOT NULL");
    if (query.source === "external") where.push("(si.source = 'external' OR si.product_id IS NULL)");
    const q = (query.q || "").trim().slice(0, 100);
    if (q) {
        where.push("(si.name LIKE ? OR si.sku LIKE ? OR si.barcode = ?)");
        params.push(`%${q}%`, `%${q}%`, q);
    }
    const stockExpr = "CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL THEN COALESCE(v.stock, p.stock) ELSE si.stock END";
    if (query.low === "1" || query.low === "true") where.push(`${stockExpr} <= si.reorder_level`);
    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
        `${ITEM_SELECT} WHERE ${whereSql} ORDER BY si.name ASC, si.id ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM stock_items si
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE ${whereSql}`,
        params
    );
    const [[summary]] = await db.query(
        `SELECT COUNT(*) AS items,
                COALESCE(SUM(CASE WHEN ${stockExpr} <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
                COALESCE(SUM(CASE WHEN ${stockExpr} > 0 AND ${stockExpr} <= si.reorder_level THEN 1 ELSE 0 END), 0) AS low_stock,
                COALESCE(SUM(${stockExpr} * COALESCE(si.cost_price, 0)), 0) AS stock_value_at_cost
         FROM stock_items si
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE si.seller_id = ? AND si.is_archived = 0`,
        [sellerId]
    );
    return {
        items: rows.map(shapeItem),
        total: Number(total),
        page,
        limit,
        summary: {
            items: Number(summary.items),
            out_of_stock: Number(summary.out_of_stock),
            low_stock: Number(summary.low_stock),
            stock_value_at_cost: Number(summary.stock_value_at_cost)
        }
    };
};

exports.getItem = async (sellerId, itemId) => {
    const [rows] = await db.query(`${ITEM_SELECT} WHERE si.id = ? AND si.seller_id = ?`, [itemId, sellerId]);
    if (!rows[0]) throw fail("Item not found.", 404);
    return shapeItem(rows[0]);
};

// ---------------------------------------------------------------- write

const insertExternal = async (sellerId, data) => {
    const defaultLevel = await settingsService.getStockDefaultReorderLevel();
    const level = data.reorderLevel === undefined || data.reorderLevel === null || data.reorderLevel === ""
        ? defaultLevel : Number(data.reorderLevel);
    if (!Number.isInteger(level) || level < 0 || level > 100000) throw fail("Reorder level must be a whole number, zero or more.");
    try {
        const [result] = await db.query(
            `INSERT INTO stock_items
                (seller_id, source, name, sku, barcode, unit, cost_price, sell_price, reorder_level, stock)
             VALUES (?, 'external', ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                sellerId, String(data.name).trim().slice(0, 200), clean(data.sku, 64) ?? null,
                clean(data.barcode, 64) ?? null, clean(data.unit, 20) || "pcs",
                money(data.costPrice), money(data.sellPrice) ?? 0, level
            ]
        );
        return result.insertId;
    } catch (error) {
        if (isDuplicateKeyError(error)) throw fail("Another item already uses this barcode.", 409);
        throw error;
    }
};

exports.createItem = async (sellerId, data, { createdBy } = {}) => {
    if (!data.name || !String(data.name).trim()) throw fail("Item name is required.");
    const itemId = await insertExternal(sellerId, data);

    const opening = Number(data.openingStock);
    if (data.openingStock !== undefined && data.openingStock !== null && data.openingStock !== "") {
        if (!Number.isInteger(opening) || opening < 0 || opening > MAX_STOCK) throw fail("Opening stock must be a whole number, zero or more.");
        if (opening > 0) {
            await exports.adjust(sellerId, itemId, {
                type: "opening", quantity: opening, unitCost: data.costPrice,
                reason: "Opening stock", idempotencyKey: data.idempotencyKey
            }, { createdBy: createdBy || sellerId });
        }
    }
    auditService.log({
        userId: createdBy || sellerId, eventType: "stock.item_created",
        description: `Stock item ${itemId} created`, metadata: { itemId, name: String(data.name).trim().slice(0, 200) }
    });
    return exports.getItem(sellerId, itemId);
};

exports.updateItem = async (sellerId, itemId, data) => {
    const item = await exports.getItem(sellerId, itemId);
    const sets = [];
    const params = [];
    const add = (col, val) => { sets.push(`${col} = ?`); params.push(val); };

    if (data.sku !== undefined) add("sku", clean(data.sku, 64));
    if (data.barcode !== undefined) add("barcode", clean(data.barcode, 64));
    if (data.unit !== undefined) add("unit", clean(data.unit, 20) || "pcs");
    if (data.costPrice !== undefined) add("cost_price", money(data.costPrice));
    if (data.reorderLevel !== undefined) {
        const level = Number(data.reorderLevel);
        if (!Number.isInteger(level) || level < 0 || level > 100000) throw fail("Reorder level must be a whole number, zero or more.");
        add("reorder_level", level);
    }
    // Name and selling price of a Nexora-listed item belong to the listing.
    if (item.source === "external") {
        if (data.name !== undefined) {
            if (!String(data.name).trim()) throw fail("Item name is required.");
            add("name", String(data.name).trim().slice(0, 200));
        }
        if (data.sellPrice !== undefined) add("sell_price", money(data.sellPrice) ?? 0);
    } else if (data.name !== undefined || data.sellPrice !== undefined) {
        throw fail("Change the name and price of a listed item from its product page.", 409);
    }
    if (sets.length) {
        try {
            await db.query(`UPDATE stock_items SET ${sets.join(", ")} WHERE id = ? AND seller_id = ?`, [...params, itemId, sellerId]);
        } catch (error) {
            if (isDuplicateKeyError(error)) throw fail("Another item already uses this barcode.", 409);
            throw error;
        }
        const changed = sets.map((x) => x.split(" = ")[0]);
        auditService.log({
            userId: sellerId, eventType: "stock.item_updated", description: `Stock item ${itemId} updated`,
            metadata: {
                itemId, fields: changed,
                ...(changed.includes("cost_price") ? { costBefore: item.cost_price ?? null, costAfter: data.costPrice } : {})
            }
        });
    }
    return exports.getItem(sellerId, itemId);
};

exports.setArchived = async (sellerId, itemId, archived) => {
    await exports.getItem(sellerId, itemId);
    await db.query("UPDATE stock_items SET is_archived = ? WHERE id = ? AND seller_id = ?", [archived ? 1 : 0, itemId, sellerId]);
    auditService.log({
        userId: sellerId, eventType: "stock.item_archived",
        description: `Stock item ${itemId} ${archived ? "archived" : "restored"}`, metadata: { itemId, archived: !!archived }
    });
    return exports.getItem(sellerId, itemId);
};

// A stock movement posted by the seller: purchase (adds), correction (sets the
// counted number) or opening (adds). Locked relative delta + ledger row.
exports.adjust = async (sellerId, itemId, input, { createdBy } = {}) => {
    const { type, idempotencyKey } = input;
    if (!["purchase", "correction", "opening"].includes(type)) throw fail("Invalid movement type.");

    const payloadHash = stockLedger.hashPayload({
        itemId, type, quantity: input.quantity ?? null, newStock: input.newStock ?? null,
        baseline: input.baseline ?? null, unitCost: input.unitCost ?? null
    });

    try {
        const outcome = await stockLedger.withTransaction(async (connection) => {
            const existing = await stockLedger.checkIdempotency(connection, sellerId, idempotencyKey, payloadHash);
            if (existing) return { existing };

            const target = await stockLedger.lockByItem(connection, sellerId, itemId, { createdBy });
            const meta = { type, reason: clean(input.reason, 255), idempotencyKey, payloadHash, refType: "manual", createdBy };
            const unitCost = money(input.unitCost);
            if (unitCost !== null) meta.unitCost = unitCost;

            let result;
            if (type === "correction") {
                result = await stockLedger.setStock(connection, target, input.newStock, { ...meta, baseline: input.baseline });
                if (!result) throw fail("Counted stock matches the current stock - nothing to correct.");
            } else {
                const quantity = Number(input.quantity);
                if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_STOCK) {
                    throw fail("Quantity must be a whole number greater than zero.");
                }
                result = await stockLedger.applyDelta(connection, target, quantity, meta);
                if (type === "purchase" && unitCost !== null) {
                    await connection.query(
                        "UPDATE stock_items SET cost_price = ? WHERE id = ? AND seller_id = ?", [unitCost, itemId, sellerId]
                    );
                }
            }
            return { result, target };
        });

        if (outcome.existing) return { movement: outcome.existing, replayed: true };

        const { result, target } = outcome;
        auditService.log({
            userId: createdBy || sellerId, eventType: "stock.stock_adjusted",
            description: `Stock item ${itemId}: ${type} ${result.quantityChange >= 0 ? "+" : ""}${result.quantityChange}`,
            metadata: { itemId, type, before: result.stockBefore, after: result.stockAfter, reason: clean(input.reason, 255) }
        });
        if (target.kind === "product" && target.product) {
            productAlertService.checkAndNotifyStockChange(
                { id: target.product.id, name: target.product.name, slug: target.product.slug, stock: result.stockAfter },
                result.stockBefore
            ).catch(() => {});
        }
        return { movement: result, item: await exports.getItem(sellerId, itemId), replayed: false };
    } catch (error) {
        if (isDuplicateKeyError(error) && idempotencyKey) {
            const [rows] = await db.query(
                "SELECT * FROM stock_movements WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, idempotencyKey]
            );
            if (rows[0]) return { movement: rows[0], replayed: true };
        }
        throw error;
    }
};

// "List on Nexora": turn an external item into a draft listing. The stock number
// moves from the item onto the new product (ledger rows on both sides of the move),
// the item becomes 'nexora'. The seller finishes the listing in the product wizard.
exports.listOnNexora = async (sellerId, itemId, { categoryId } = {}) => {
    return stockLedger.withTransaction(async (connection) => {
        const item = await stockLedger.findItem(connection, sellerId, itemId, { lock: true });
        if (!item) throw fail("Item not found.", 404);
        if (item.source === "nexora" && item.product_id) throw fail("This item is already sold on Nexora.", 409);
        if (item.legacy_product_id) throw fail("Items from the old business-tools list can't be listed yet. Add the product from your catalog.", 409);

        const slug = `draft-${require("crypto").randomBytes(8).toString("hex")}`;
        const [created] = await connection.query(
            `INSERT INTO products (seller_id, category_id, name, slug, description, price, stock, is_active, is_draft)
             VALUES (?, ?, ?, ?, NULL, ?, ?, FALSE, TRUE)`,
            [sellerId, categoryId || null, item.name, slug,
                Number(item.sell_price) || 0, Math.max(0, Number(item.stock))]
        );
        const productId = created.insertId;
        const key = stockLedger.linkKey(productId, null);

        if (Number(item.stock) !== 0) {
            await connection.query(
                `INSERT INTO stock_movements
                    (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, ref_id, reason, created_by)
                 VALUES (?, ?, 'correction', ?, ?, 0, 'list_on_nexora', ?, 'Stock moved to the Nexora listing', ?)`,
                [sellerId, itemId, -Number(item.stock), Number(item.stock), productId, sellerId]
            );
            await connection.query(
                `INSERT INTO stock_movements
                    (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, ref_id, reason, created_by)
                 VALUES (?, ?, 'correction', ?, 0, ?, 'list_on_nexora', ?, 'Stock moved from the item', ?)`,
                [sellerId, itemId, Number(item.stock), Number(item.stock), productId, sellerId]
            );
        }
        // The live number now sits on the product; the item's own copy goes to 0.
        await connection.query(
            "UPDATE stock_items SET source = 'nexora', product_id = ?, variant_id = NULL, link_key = ?, stock = 0 WHERE id = ?",
            [productId, key, itemId]
        );
        return { item_id: itemId, product_id: productId };
    });
};

// "Unlink": reverse of the above. The listing is switched off (never deleted - past
// orders point at it), its stock number moves back onto the item.
exports.unlink = async (sellerId, itemId) => {
    return stockLedger.withTransaction(async (connection) => {
        const probe = await stockLedger.findItem(connection, sellerId, itemId);
        if (!probe) throw fail("Item not found.", 404);
        if (probe.source !== "nexora" || !probe.product_id) throw fail("This item is not sold on Nexora.", 409);
        if (probe.variant_id) throw fail("Items for product variants can't be unlinked. Archive the item instead.", 409);

        const target = await stockLedger.lockByItem(connection, sellerId, itemId, { createdBy: sellerId });
        const stock = target.stock;
        await connection.query("UPDATE products SET is_active = FALSE, is_sponsored = 0 WHERE id = ?", [probe.product_id]);

        await connection.query(
            `INSERT INTO stock_movements
                (seller_id, stock_item_id, type, quantity_change, stock_before, stock_after, ref_type, ref_id, reason, created_by)
             VALUES (?, ?, 'correction', 0, ?, ?, 'unlink', ?, 'Listing switched off - item is now sold outside Nexora', ?)`,
            [sellerId, itemId, stock, stock, probe.product_id, sellerId]
        );
        // The product keeps its own stock number (and history); the item takes a copy.
        await connection.query(
            "UPDATE stock_items SET source = 'external', stock = ?, product_id = NULL, variant_id = NULL, link_key = NULL WHERE id = ?",
            [stock, itemId]
        );
        return { item_id: itemId, product_id: probe.product_id };
    });
};

// ---------------------------------------------------------------- ledger

exports.listMovements = async (sellerId, query) => {
    const { limit, page, offset } = pageParams(query);
    const where = ["m.seller_id = ?"];
    const params = [sellerId];
    if (query.item_id) { where.push("m.stock_item_id = ?"); params.push(Number(query.item_id)); }
    if (query.type) { where.push("m.type = ?"); params.push(query.type); }
    if (query.from) { where.push("m.created_at >= ?"); params.push(query.from); }
    if (query.to) { where.push("m.created_at < ?"); params.push(query.to); }
    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
        `SELECT m.id, m.stock_item_id, m.type, m.quantity_change, m.stock_before, m.stock_after, m.unit_cost,
                m.ref_type, m.ref_id, m.reason, m.created_by, m.created_at, si.name AS item_name
         FROM stock_movements m JOIN stock_items si ON si.id = m.stock_item_id
         WHERE ${whereSql} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM stock_movements m WHERE ${whereSql}`, params);
    return { items: rows, total: Number(total), page, limit };
};

// Items whose live number no longer matches the last ledger row - the signal that
// something changed stock without writing to the ledger.
exports.reconcile = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT si.id, si.name,
                CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL THEN COALESCE(v.stock, p.stock) ELSE si.stock END AS live_stock,
                (SELECT m.stock_after FROM stock_movements m WHERE m.stock_item_id = si.id ORDER BY m.id DESC LIMIT 1) AS ledger_stock
         FROM stock_items si
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE si.seller_id = ?
         HAVING ledger_stock IS NOT NULL AND live_stock <> ledger_stock
         LIMIT 200`,
        [sellerId]
    );
    return {
        ok: rows.length === 0,
        drift: rows.map((r) => ({ item_id: r.id, name: r.name, live_stock: Number(r.live_stock), ledger_stock: Number(r.ledger_stock) }))
    };
};
