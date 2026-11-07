const db = require("../../config/db");
const stockLedger = require("./stock.ledger");
const stockService = require("./stock.service");
const settingsService = require("../settings/settings.service");
const auditService = require("../audit/audit.service");
const trade = require("./stock.trade");
const { MAX_STOCK } = require("../../config/stock");
const stockAlerts = require("./stock.alerts");

const { fail } = stockLedger;
const { round2 } = trade;

// Nexora Stock Management (Phase 7): sales. One receipt = one sale with lines.
// Every stock change goes through stock.ledger (row-locked, relative delta, one
// ledger row per line) inside the same transaction as the sale rows, so a sale
// is all-or-nothing. Items are always locked in ascending id order so two tills
// selling the same things can't deadlock.

const variantLabelOf = (options) => {
    if (!options) return null;
    let parsed = options;
    if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch (_) { return parsed.slice(0, 255); }
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.values(parsed).filter(Boolean).join(" / ").slice(0, 255) || null;
    }
    return null;
};

const toNum = (v) => (v === null || v === undefined ? null : Number(v));

const shapeSale = (row) => {
    const total = Number(row.total_amount);
    const returned = Number(row.returned_amount || 0);
    const paid = Number(row.paid_amount || 0);
    return {
        id: Number(row.id),
        receipt_no: row.receipt_no,
        source: row.source,
        status: row.voided_at ? "voided" : "active",
        customer_id: row.customer_id || null,
        customer_name: row.customer_name || null,
        currency: row.currency,
        subtotal: Number(row.subtotal),
        discount_amount: Number(row.discount_amount),
        total_amount: total,
        returned_amount: returned,
        net_amount: round2(total - returned),
        paid_amount: paid,
        balance: row.voided_at ? 0 : trade.balanceOf(row),
        payment_method: row.payment_method,
        note: row.note || null,
        sold_at: row.sold_at,
        is_backdated: !!row.is_backdated,
        is_offline: !!row.is_offline,
        stock_flagged: !!row.stock_flagged,
        voided_at: row.voided_at || null,
        void_reason: row.void_reason || null,
        line_count: row.line_count === undefined ? undefined : Number(row.line_count)
    };
};

const shapeLine = (row) => ({
    id: Number(row.id),
    stock_item_id: row.stock_item_id || null,
    item_name: row.item_name,
    variant_label: row.variant_label || null,
    item_source: row.item_source,
    quantity: Number(row.quantity),
    returned_quantity: Number(row.returned_quantity),
    unit_price: Number(row.unit_price),
    unit_cost: toNum(row.unit_cost),
    line_total: Number(row.line_total)
});

// ---------------------------------------------------------------- lookup

// Search box of the quick-sale screen: name, SKU or barcode. An exact barcode or
// SKU match sorts first, so a scanner (which "types" the code and presses Enter)
// lands on the right item.
exports.lookupItems = async (sellerId, query = {}) => {
    await stockService.syncListingItems(sellerId);
    const q = String(query.q || "").trim().slice(0, 100);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
    const where = ["si.seller_id = ?", "si.is_archived = 0"];
    const params = [sellerId];
    let order = "si.name ASC, si.id ASC";
    if (q) {
        where.push("(si.name LIKE ? OR si.sku LIKE ? OR si.barcode = ?)");
        params.push(`%${q}%`, `%${q}%`, q);
        order = "(si.barcode = ? OR si.sku = ?) DESC, si.name ASC, si.id ASC";
    }
    const [rows] = await db.query(
        `SELECT si.id, si.source, si.product_id, si.name, si.sku, si.barcode, si.unit, si.cost_price, si.reorder_level,
                CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL
                     THEN COALESCE(v.stock, p.stock) ELSE si.stock END AS stock,
                CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL
                     THEN COALESCE(p.discount_price, p.price) + COALESCE(v.price_delta, 0) ELSE si.sell_price END AS sell_price,
                CASE WHEN si.source = 'nexora' AND si.product_id IS NOT NULL THEN p.name ELSE si.name END AS display_name,
                v.options AS variant_options
         FROM stock_items si
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE ${where.join(" AND ")}
         ORDER BY ${order} LIMIT ?`,
        q ? [...params, q, q, limit] : [...params, limit]
    );
    return rows.map((r) => ({
        id: r.id,
        source: r.source === "nexora" && r.product_id ? "nexora" : "external",
        name: r.display_name,
        variant_label: variantLabelOf(r.variant_options),
        sku: r.sku,
        barcode: r.barcode,
        unit: r.unit,
        sell_price: Number(r.sell_price),
        cost_price: toNum(r.cost_price),
        stock: Number(r.stock)
    }));
};

// ---------------------------------------------------------------- locking

const sortedUnique = (ids) => [...new Set(ids)].sort((a, b) => a - b);

// Locks stock items in ascending id order and returns Map(itemId -> target).
exports.lockItems = async (connection, sellerId, ids, { createdBy, allowArchived = false } = {}) => {
    const targets = new Map();
    for (const id of sortedUnique(ids)) {
        const target = await stockLedger.lockByItem(connection, sellerId, id, { createdBy });
        if (target.item.is_archived && !allowArchived) {
            throw fail(`"${target.item.name}" is archived. Restore it before selling it.`, 409);
        }
        targets.set(id, target);
    }
    return targets;
};

const defaultPrice = (target) => {
    if (target.kind === "item") return Number(target.item.sell_price);
    return Number(target.product.discount_price ?? target.product.price)
        + (target.variant ? Number(target.variant.price_delta || 0) : 0);
};

const displayName = (target) => (target.kind === "item" ? target.item.name : target.product.name);

// ---------------------------------------------------------------- create

const normaliseLines = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) throw fail("Add at least one item to the sale.");
    if (raw.length > trade.MAX_LINES) throw fail(`A sale can have at most ${trade.MAX_LINES} lines.`);
    return raw.map((l) => {
        const itemId = Number(l && l.itemId);
        const quantity = Number(l && l.quantity);
        if (!Number.isInteger(itemId) || itemId <= 0) throw fail("Choose an item for every line.");
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_STOCK) {
            throw fail("Quantity must be a whole number greater than zero.");
        }
        let unitPrice = null;
        if (l.unitPrice !== undefined && l.unitPrice !== null && l.unitPrice !== "") unitPrice = trade.money(l.unitPrice, "Unit price");
        return { itemId, quantity, unitPrice };
    });
};

const findByKey = async (connection, sellerId, key) => {
    const [rows] = await connection.query(
        "SELECT id, payload_hash FROM sales WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, key]
    );
    return rows[0];
};

// A sale rung up on a device that was offline is already complete - the goods are gone
// and the money is taken. So a synced sale is never refused for stock or date reasons
// (`offline: true` from exports.syncOffline): the date is kept as the till recorded it
// (a future or invalid one becomes "now"), archived items are allowed, and stock is
// allowed to go below zero - the sale is then flagged (stock_flagged) and the seller is
// alerted so the count can be fixed. Anything else wrong with it (a malformed line, a
// credit sale with no customer) is still rejected, per sale, by syncOffline.
const resolveOfflineWhen = (input, now = new Date()) => {
    const date = input ? new Date(input) : null;
    if (!date || Number.isNaN(date.getTime()) || date.getTime() > now.getTime() + 5 * 60 * 1000) {
        return { date: now, isBackdated: false };
    }
    return { date, isBackdated: now.getTime() - date.getTime() > 10 * 60 * 1000 };
};

exports.createSale = async (sellerId, input, { createdBy, offline = false } = {}) => {
    const lines = normaliseLines(input.lines);
    const method = input.paymentMethod || "cash";
    if (!trade.PAYMENT_METHODS.includes(method)) throw fail("Choose how the customer is paying.");
    const discount = input.discount === undefined || input.discount === null || input.discount === ""
        ? 0 : trade.money(input.discount, "Discount");
    const paidVia = input.paidVia || (trade.MONEY_METHODS.includes(method) ? method : "cash");
    if (!trade.MONEY_METHODS.includes(paidVia)) throw fail("Invalid payment method.");
    const customerId = input.customerId ? Number(input.customerId) : null;
    if (input.customerId && (!Number.isInteger(customerId) || customerId <= 0)) throw fail("Invalid customer.");
    const idempotencyKey = input.idempotencyKey || null;

    const maxDays = await settingsService.getStockBackdateMaxDays();
    const when = offline ? resolveOfflineWhen(input.soldAt) : trade.resolveWhen(input.soldAt, maxDays);

    const payloadHash = stockLedger.hashPayload({
        kind: "sale",
        lines: lines.map((l) => [l.itemId, l.quantity, l.unitPrice]),
        discount, method, paidVia,
        amountPaid: input.amountPaid ?? null,
        customerId, customerName: input.customerName || null,
        note: input.note || null, soldAt: input.soldAt || null
    });

    try {
        const outcome = await stockLedger.withTransaction(async (connection) => {
            if (idempotencyKey) {
                const existing = await findByKey(connection, sellerId, idempotencyKey);
                if (existing) {
                    if (existing.payload_hash && existing.payload_hash !== payloadHash) {
                        throw fail("This request id was already used for a different sale. Reload and try again.", 409);
                    }
                    return { existingId: existing.id };
                }
            }

            let customer = null;
            if (customerId) {
                const [rows] = await connection.query(
                    "SELECT id, name FROM stock_customers WHERE id = ? AND seller_id = ? AND is_archived = 0", [customerId, sellerId]
                );
                customer = rows[0];
                if (!customer) throw fail("Customer not found.", 404);
            }

            const receiptNo = await trade.nextNumber(connection, sellerId, "sale");
            const targets = await exports.lockItems(connection, sellerId, lines.map((l) => l.itemId), { createdBy, allowArchived: offline });

            const priced = lines.map((l) => {
                const target = targets.get(l.itemId);
                const unitPrice = l.unitPrice === null ? round2(defaultPrice(target)) : l.unitPrice;
                return {
                    ...l, target, unitPrice,
                    lineTotal: round2(unitPrice * l.quantity),
                    unitCost: toNum(target.item.cost_price)
                };
            });
            const subtotal = round2(priced.reduce((s, l) => s + l.lineTotal, 0));
            if (discount > subtotal) throw fail("The discount can't be more than the sale total.");
            const total = round2(subtotal - discount);

            let paid;
            if (method === "credit") {
                paid = input.amountPaid === undefined || input.amountPaid === null || input.amountPaid === ""
                    ? 0 : trade.money(input.amountPaid, "Amount paid");
                if (paid > total) throw fail("The amount paid can't be more than the sale total.");
                if (round2(total - paid) > 0 && !customer) throw fail("Choose or add a customer for a credit sale.");
            } else {
                paid = total;
            }

            const customerName = customer ? customer.name : trade.clean(input.customerName, 120);
            const [saleResult] = await connection.query(
                `INSERT INTO sales
                    (seller_id, receipt_no, source, customer_id, customer_name, currency, subtotal, discount_amount,
                     total_amount, paid_amount, payment_method, note, sold_at, is_backdated, idempotency_key,
                     payload_hash, created_by, is_offline, client_created_at)
                 VALUES (?, ?, 'pos', ?, ?, 'TZS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sellerId, receiptNo, customer ? customer.id : null, customerName, subtotal, discount, total, paid,
                    method, trade.clean(input.note, 255), when.date, when.isBackdated ? 1 : 0, idempotencyKey,
                    payloadHash, createdBy || sellerId, offline ? 1 : 0, offline ? when.date : null
                ]
            );
            const saleId = saleResult.insertId;

            await connection.query(
                `INSERT INTO sale_lines
                    (sale_id, seller_id, stock_item_id, item_name, variant_label, item_source, quantity, unit_price, unit_cost, line_total)
                 VALUES ?`,
                [priced.map((l) => [
                    saleId, sellerId, l.itemId, displayName(l.target).slice(0, 200),
                    l.target.variant ? variantLabelOf(l.target.variant.options) : null,
                    l.target.item.source === "nexora" && l.target.item.product_id ? "nexora" : "external",
                    l.quantity, l.unitPrice, l.unitCost, l.lineTotal
                ])]
            );

            const flaggedNames = [];
            for (const l of priced) {
                const moved = await stockLedger.applyDelta(connection, l.target, -l.quantity, {
                    type: "sale", reason: `Sale ${receiptNo}`, refType: "sale", refId: saleId,
                    unitCost: l.unitCost === null ? undefined : l.unitCost, createdBy: createdBy || sellerId,
                    allowNegative: offline
                });
                if (offline && moved.stockAfter < 0) flaggedNames.push(displayName(l.target));
            }
            if (flaggedNames.length) await connection.query("UPDATE sales SET stock_flagged = 1 WHERE id = ?", [saleId]);

            await trade.insertPayment(connection, {
                sellerId, direction: "in", amount: paid, method: paidVia, saleId, customerId: customer ? customer.id : null,
                kind: "sale", paidAt: when.date, createdBy: createdBy || sellerId
            });

            return { saleId, receiptNo, backdated: when.isBackdated, flaggedNames };
        });

        if (outcome.existingId) return { sale: await exports.getSale(sellerId, outcome.existingId), replayed: true };

        if (outcome.backdated) {
            auditService.log({
                userId: createdBy || sellerId, eventType: "stock.sale_backdated",
                description: `Sale ${outcome.receiptNo} was dated ${when.date.toISOString()}`,
                metadata: { saleId: outcome.saleId, soldAt: when.date.toISOString() }
            });
        }
        if (outcome.flaggedNames && outcome.flaggedNames.length) {
            auditService.log({
                userId: createdBy || sellerId, eventType: "stock.offline_sale_negative_stock",
                description: `Offline sale ${outcome.receiptNo} took stock below zero`,
                metadata: { saleId: outcome.saleId, items: outcome.flaggedNames }
            });
            stockAlerts.notifyNegativeStock(sellerId, outcome.receiptNo, outcome.flaggedNames);
        }
        return { sale: await exports.getSale(sellerId, outcome.saleId), replayed: false };
    } catch (error) {
        if (trade.isDuplicateKeyError(error) && idempotencyKey) {
            const [rows] = await db.query("SELECT id FROM sales WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, idempotencyKey]);
            if (rows[0]) return { sale: await exports.getSale(sellerId, rows[0].id), replayed: true };
        }
        throw error;
    }
};

// ---------------------------------------------------------------- read

exports.getSale = async (sellerId, saleId, connection = db) => {
    const [rows] = await connection.query("SELECT * FROM sales WHERE id = ? AND seller_id = ?", [saleId, sellerId]);
    if (!rows[0]) throw fail("Sale not found.", 404);
    const [lines] = await connection.query("SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY id", [saleId]);
    const [returns] = await connection.query(
        "SELECT id, return_amount, refund_amount, credit_amount, reason, created_at FROM sale_returns WHERE sale_id = ? ORDER BY id", [saleId]
    );
    const [payments] = await connection.query(
        "SELECT id, direction, amount, method, kind, note, paid_at FROM stock_payments WHERE sale_id = ? AND seller_id = ? ORDER BY paid_at, id",
        [saleId, sellerId]
    );
    return {
        ...shapeSale(rows[0]),
        lines: lines.map(shapeLine),
        returns: returns.map((r) => ({
            id: Number(r.id), return_amount: Number(r.return_amount), refund_amount: Number(r.refund_amount),
            credit_amount: Number(r.credit_amount), reason: r.reason, created_at: r.created_at
        })),
        payments: payments.map((p) => ({
            id: Number(p.id), direction: p.direction, amount: Number(p.amount), method: p.method,
            kind: p.kind, note: p.note, paid_at: p.paid_at
        }))
    };
};

exports.listSales = async (sellerId, query = {}) => {
    const { limit, page, offset } = trade.pageParams(query);
    const where = ["s.seller_id = ?"];
    const params = [sellerId];
    if (query.status === "active") where.push("s.voided_at IS NULL");
    if (query.status === "voided") where.push("s.voided_at IS NOT NULL");
    if (query.customer_id) { where.push("s.customer_id = ?"); params.push(Number(query.customer_id)); }
    if (query.method) { where.push("s.payment_method = ?"); params.push(query.method); }
    if (query.owing === "1" || query.owing === "true") {
        where.push("s.voided_at IS NULL AND (s.total_amount - s.returned_amount - s.paid_amount) > 0");
    }
    const q = String(query.q || "").trim().slice(0, 100);
    if (q) { where.push("(s.receipt_no LIKE ? OR s.customer_name LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
    if (query.from) { where.push("s.sold_at >= ?"); params.push(trade.dayStart(query.from)); }
    if (query.to) { where.push("s.sold_at < ?"); params.push(trade.dayAfter(query.to)); }
    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
        `SELECT s.*, (SELECT COUNT(*) FROM sale_lines l WHERE l.sale_id = s.id) AS line_count
         FROM sales s WHERE ${whereSql} ORDER BY s.sold_at DESC, s.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[summary]] = await db.query(
        `SELECT COUNT(*) AS sales,
                COALESCE(SUM(CASE WHEN s.voided_at IS NULL THEN s.total_amount - s.returned_amount ELSE 0 END), 0) AS net_total,
                COALESCE(SUM(CASE WHEN s.voided_at IS NULL THEN GREATEST(s.total_amount - s.returned_amount - s.paid_amount, 0) ELSE 0 END), 0) AS owed
         FROM sales s WHERE ${whereSql}`,
        params
    );
    return {
        items: rows.map(shapeSale),
        total: Number(summary.sales),
        page,
        limit,
        summary: { net_total: Number(summary.net_total), owed: Number(summary.owed), currency: "TZS" }
    };
};

// ---------------------------------------------------------------- void

exports.voidSale = async (sellerId, saleId, { reason } = {}, { createdBy } = {}) => {
    const why = trade.clean(reason, 255);
    if (!why || why.length < 3) throw fail("Give a short reason for cancelling this sale.");
    const actor = createdBy || sellerId;

    const outcome = await stockLedger.withTransaction(async (connection) => {
        const [saleRows] = await connection.query("SELECT * FROM sales WHERE id = ? AND seller_id = ? FOR UPDATE", [saleId, sellerId]);
        const sale = saleRows[0];
        if (!sale) throw fail("Sale not found.", 404);
        if (sale.voided_at) throw fail("This sale is already cancelled.", 409);
        if (sale.source === "legacy") throw fail("Sales from the old sales screen can't be cancelled here.", 409);

        const [lines] = await connection.query("SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY id FOR UPDATE", [saleId]);
        const restock = lines.filter((l) => l.stock_item_id && Number(l.quantity) - Number(l.returned_quantity) > 0);
        const targets = await exports.lockItems(connection, sellerId, restock.map((l) => l.stock_item_id), { createdBy: actor, allowArchived: true });

        for (const l of restock) {
            await stockLedger.applyDelta(connection, targets.get(l.stock_item_id), Number(l.quantity) - Number(l.returned_quantity), {
                type: "void", reason: `Cancelled sale ${sale.receipt_no}`, refType: "sale", refId: saleId,
                unitCost: l.unit_cost === null ? undefined : Number(l.unit_cost), createdBy: actor
            });
        }

        const paid = Number(sale.paid_amount);
        if (paid > 0) {
            await trade.insertPayment(connection, {
                sellerId, direction: "out", amount: paid,
                method: trade.MONEY_METHODS.includes(sale.payment_method) ? sale.payment_method : "cash",
                saleId, customerId: sale.customer_id, kind: "void_refund", note: `Cancelled sale ${sale.receipt_no}`,
                createdBy: actor
            });
        }
        await connection.query(
            "UPDATE sales SET voided_at = UTC_TIMESTAMP(), voided_by = ?, void_reason = ? WHERE id = ?", [actor, why, saleId]
        );
        return { receiptNo: sale.receipt_no, refunded: paid };
    });

    auditService.log({
        userId: actor, eventType: "stock.sale_voided",
        description: `Sale ${outcome.receiptNo} cancelled: ${why}`,
        metadata: { saleId, refunded: outcome.refunded }
    });
    return exports.getSale(sellerId, saleId);
};

// ---------------------------------------------------------------- return

exports.returnSale = async (sellerId, saleId, input = {}, { createdBy } = {}) => {
    const actor = createdBy || sellerId;
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    if (!rawLines.length) throw fail("Choose what is being returned.");
    const wanted = new Map();
    for (const l of rawLines) {
        const lineId = Number(l && l.saleLineId);
        const qty = Number(l && l.quantity);
        if (!Number.isInteger(lineId) || lineId <= 0) throw fail("Invalid sale line.");
        if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_STOCK) throw fail("Return quantity must be a whole number greater than zero.");
        wanted.set(lineId, (wanted.get(lineId) || 0) + qty);
    }
    const refundVia = input.refundMethod || null;
    if (refundVia && !trade.MONEY_METHODS.includes(refundVia)) throw fail("Invalid refund method.");
    const idempotencyKey = input.idempotencyKey || null;
    const payloadHash = stockLedger.hashPayload({
        kind: "return", saleId, lines: [...wanted.entries()].sort((a, b) => a[0] - b[0]),
        refundVia, reason: input.reason || null
    });

    try {
        const outcome = await stockLedger.withTransaction(async (connection) => {
            if (idempotencyKey) {
                const [ex] = await connection.query(
                    "SELECT id, payload_hash FROM sale_returns WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, idempotencyKey]
                );
                if (ex[0]) {
                    if (ex[0].payload_hash && ex[0].payload_hash !== payloadHash) {
                        throw fail("This request id was already used for a different return. Reload and try again.", 409);
                    }
                    return { replayed: true };
                }
            }

            const [saleRows] = await connection.query("SELECT * FROM sales WHERE id = ? AND seller_id = ? FOR UPDATE", [saleId, sellerId]);
            const sale = saleRows[0];
            if (!sale) throw fail("Sale not found.", 404);
            if (sale.voided_at) throw fail("This sale is cancelled - nothing can be returned from it.", 409);
            if (sale.source === "legacy") throw fail("Sales from the old sales screen can't take returns here.", 409);

            const [lines] = await connection.query("SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY id FOR UPDATE", [saleId]);
            const byId = new Map(lines.map((l) => [Number(l.id), l]));
            for (const [lineId, qty] of wanted) {
                const line = byId.get(lineId);
                if (!line) throw fail("That line is not part of this sale.", 404);
                const remaining = Number(line.quantity) - Number(line.returned_quantity);
                if (qty > remaining) throw fail(`Only ${remaining} of "${line.item_name}" can still be returned.`, 409);
            }

            const subtotal = Number(sale.subtotal);
            const keep = subtotal > 0 ? 1 - Number(sale.discount_amount) / subtotal : 1;
            let amount = 0;
            const returnLines = [];
            for (const [lineId, qty] of wanted) {
                const line = byId.get(lineId);
                const value = round2(Number(line.unit_price) * qty * keep);
                amount = round2(amount + value);
                returnLines.push({ line, qty, value });
            }
            // Everything back: settle exactly to the sale total so rounding can't leave a few cents behind.
            const allBack = lines.every((l) => {
                const q = wanted.get(Number(l.id)) || 0;
                return Number(l.returned_quantity) + q === Number(l.quantity);
            });
            const previousReturned = Number(sale.returned_amount);
            if (allBack) amount = round2(Number(sale.total_amount) - previousReturned);

            const newReturned = round2(previousReturned + amount);
            const net = round2(Number(sale.total_amount) - newReturned);
            const paid = Number(sale.paid_amount);
            const refund = Math.max(0, round2(paid - net));
            const credit = round2(amount - refund);

            const targets = await exports.lockItems(
                connection, sellerId, returnLines.filter((r) => r.line.stock_item_id).map((r) => r.line.stock_item_id),
                { createdBy: actor, allowArchived: true }
            );
            for (const r of returnLines) {
                if (!r.line.stock_item_id) continue;
                await stockLedger.applyDelta(connection, targets.get(r.line.stock_item_id), r.qty, {
                    type: "return", reason: `Return from sale ${sale.receipt_no}`, refType: "sale", refId: saleId,
                    unitCost: r.line.unit_cost === null ? undefined : Number(r.line.unit_cost), createdBy: actor
                });
            }

            const [ret] = await connection.query(
                `INSERT INTO sale_returns (seller_id, sale_id, return_amount, refund_amount, credit_amount, reason, idempotency_key, payload_hash, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [sellerId, saleId, amount, refund, credit, trade.clean(input.reason, 255), idempotencyKey, payloadHash, actor]
            );
            await connection.query(
                "INSERT INTO sale_return_lines (return_id, sale_line_id, quantity, amount) VALUES ?",
                [returnLines.map((r) => [ret.insertId, Number(r.line.id), r.qty, r.value])]
            );
            for (const r of returnLines) {
                await connection.query("UPDATE sale_lines SET returned_quantity = returned_quantity + ? WHERE id = ?", [r.qty, r.line.id]);
            }
            await connection.query(
                "UPDATE sales SET returned_amount = ?, paid_amount = ? WHERE id = ?", [newReturned, round2(paid - refund), saleId]
            );
            await trade.insertPayment(connection, {
                sellerId, direction: "out", amount: refund,
                method: refundVia || (trade.MONEY_METHODS.includes(sale.payment_method) ? sale.payment_method : "cash"),
                saleId, customerId: sale.customer_id, kind: "refund", note: `Return from sale ${sale.receipt_no}`, createdBy: actor
            });
            return { receiptNo: sale.receipt_no, amount, refund, credit };
        });

        if (!outcome.replayed) {
            auditService.log({
                userId: actor, eventType: "stock.sale_returned",
                description: `Return from sale ${outcome.receiptNo}: ${outcome.amount} TZS (refunded ${outcome.refund})`,
                metadata: { saleId, ...outcome }
            });
        }
        return { sale: await exports.getSale(sellerId, saleId), replayed: !!outcome.replayed };
    } catch (error) {
        if (trade.isDuplicateKeyError(error) && idempotencyKey) {
            return { sale: await exports.getSale(sellerId, saleId), replayed: true };
        }
        throw error;
    }
};

// ------------------------------------------------------------ offline sync (Phase 8)

exports.MAX_SYNC_BATCH = 50;

// Apply sales the till queued while offline. Each carries the client's own
// idempotency key (a UUID made on the device), so sending the same batch twice - a dropped
// response, a retry after reconnecting - records each sale once. One bad sale never stops
// the others: the result lists, per key, "created" | "replayed" | "rejected" (with the
// reason). Only a sale that is invalid on its face is rejected; stock and date problems
// are not reasons to refuse a sale that already happened (see createSale).
exports.syncOffline = async (sellerId, sales, { createdBy } = {}) => {
    if (!Array.isArray(sales) || sales.length === 0) throw fail("Nothing to sync.");
    if (sales.length > exports.MAX_SYNC_BATCH) throw fail(`Send at most ${exports.MAX_SYNC_BATCH} sales at a time.`);

    const results = [];
    for (const input of sales) {
        const key = input && input.idempotencyKey;
        if (!key || String(key).length < 8) {
            results.push({ key: key || null, status: "rejected", message: "Missing request id." });
            continue;
        }
        try {
            const r = await exports.createSale(sellerId, input, { createdBy, offline: true });
            results.push({
                key, status: r.replayed ? "replayed" : "created", sale_id: r.sale.id, receipt_no: r.sale.receipt_no,
                stock_flagged: r.sale.stock_flagged
            });
        } catch (error) {
            results.push({ key, status: "rejected", message: error.message, code: error.statusCode || 400 });
        }
    }
    return results;
};
