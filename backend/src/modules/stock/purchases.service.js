const db = require("../../config/db");
const stockLedger = require("./stock.ledger");
const salesService = require("./sales.service");
const partiesService = require("./parties.service");
const settingsService = require("../settings/settings.service");
const productAlertService = require("../productAlert/productAlert.service");
const auditService = require("../audit/audit.service");
const trade = require("./stock.trade");
const { MAX_STOCK } = require("../../config/stock");

const { fail } = stockLedger;
const { round2 } = trade;

// Nexora Stock Management (Phase 7): purchases (manunuzi).
//
// Costing method: MOVING WEIGHTED AVERAGE over the units on hand. When goods are
// received:
//     new cost = (units on hand x current cost + units bought x unit cost)
//                / (units on hand + units bought)
// If nothing is on hand (or the item has no cost yet) the new cost is simply the
// unit cost of this purchase. Sales never change the cost; they snapshot it on the
// sale line, so profit reports (Phase 8) use the cost that applied at the time.

exports.weightedAverageCost = (onHand, currentCost, quantity, unitCost) => {
    const have = Math.max(0, Number(onHand) || 0);
    if (!have || currentCost === null || currentCost === undefined) return round2(unitCost);
    return round2((have * Number(currentCost) + quantity * unitCost) / (have + quantity));
};

const toNum = (v) => (v === null || v === undefined ? null : Number(v));

const shapePurchase = (row) => {
    const total = Number(row.total_amount);
    const paid = Number(row.paid_amount);
    return {
        id: Number(row.id),
        purchase_no: row.purchase_no,
        supplier_id: row.supplier_id || null,
        supplier_name: row.supplier_name || null,
        invoice_no: row.invoice_no || null,
        currency: row.currency,
        total_amount: total,
        paid_amount: paid,
        balance: Math.max(0, round2(total - paid)),
        note: row.note || null,
        purchased_at: row.purchased_at,
        is_backdated: !!row.is_backdated,
        line_count: row.line_count === undefined ? undefined : Number(row.line_count)
    };
};

const normaliseLines = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) throw fail("Add at least one item to the purchase.");
    if (raw.length > trade.MAX_LINES) throw fail(`A purchase can have at most ${trade.MAX_LINES} lines.`);
    return raw.map((l) => {
        const itemId = Number(l && l.itemId);
        const quantity = Number(l && l.quantity);
        if (!Number.isInteger(itemId) || itemId <= 0) throw fail("Choose an item for every line.");
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_STOCK) {
            throw fail("Quantity must be a whole number greater than zero.");
        }
        return { itemId, quantity, unitCost: trade.money(l.unitCost, "Unit cost") };
    });
};

exports.createPurchase = async (sellerId, input, { createdBy } = {}) => {
    const lines = normaliseLines(input.lines);
    const actor = createdBy || sellerId;
    const supplierId = input.supplierId ? Number(input.supplierId) : null;
    if (input.supplierId && (!Number.isInteger(supplierId) || supplierId <= 0)) throw fail("Invalid supplier.");
    const method = input.paymentMethod || "cash";
    if (!trade.MONEY_METHODS.includes(method)) throw fail("Invalid payment method.");
    const idempotencyKey = input.idempotencyKey || null;

    const maxDays = await settingsService.getStockBackdateMaxDays();
    const when = trade.resolveWhen(input.purchasedAt, maxDays);

    const payloadHash = stockLedger.hashPayload({
        kind: "purchase",
        lines: lines.map((l) => [l.itemId, l.quantity, l.unitCost]),
        supplierId, supplierName: input.supplierName || null, invoiceNo: input.invoiceNo || null,
        amountPaid: input.amountPaid ?? null, method, purchasedAt: input.purchasedAt || null, note: input.note || null
    });

    try {
        const outcome = await stockLedger.withTransaction(async (connection) => {
            if (idempotencyKey) {
                const [ex] = await connection.query(
                    "SELECT id, payload_hash FROM purchases WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, idempotencyKey]
                );
                if (ex[0]) {
                    if (ex[0].payload_hash && ex[0].payload_hash !== payloadHash) {
                        throw fail("This request id was already used for a different purchase. Reload and try again.", 409);
                    }
                    return { existingId: ex[0].id };
                }
            }

            let supplier = null;
            if (supplierId) {
                const [rows] = await connection.query(
                    "SELECT id, name FROM stock_suppliers WHERE id = ? AND seller_id = ? AND is_archived = 0", [supplierId, sellerId]
                );
                supplier = rows[0];
                if (!supplier) throw fail("Supplier not found.", 404);
            }

            const purchaseNo = await trade.nextNumber(connection, sellerId, "purchase");
            const targets = await salesService.lockItems(connection, sellerId, lines.map((l) => l.itemId), { createdBy: actor });

            const priced = lines.map((l) => ({ ...l, target: targets.get(l.itemId), lineTotal: round2(l.quantity * l.unitCost) }));
            const total = round2(priced.reduce((s, l) => s + l.lineTotal, 0));
            const paid = input.amountPaid === undefined || input.amountPaid === null || input.amountPaid === ""
                ? total : trade.money(input.amountPaid, "Amount paid");
            if (paid > total) throw fail("The amount paid can't be more than the purchase total.");

            const [result] = await connection.query(
                `INSERT INTO purchases
                    (seller_id, purchase_no, supplier_id, supplier_name, invoice_no, currency, total_amount, paid_amount, note,
                     purchased_at, is_backdated, idempotency_key, payload_hash, created_by)
                 VALUES (?, ?, ?, ?, ?, 'TZS', ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sellerId, purchaseNo, supplier ? supplier.id : null, supplier ? supplier.name : trade.clean(input.supplierName, 120),
                    trade.clean(input.invoiceNo, 60), total, paid, trade.clean(input.note, 255), when.date,
                    when.isBackdated ? 1 : 0, idempotencyKey, payloadHash, actor
                ]
            );
            const purchaseId = result.insertId;

            await connection.query(
                `INSERT INTO purchase_lines (purchase_id, seller_id, stock_item_id, item_name, quantity, unit_cost, line_total) VALUES ?`,
                [priced.map((l) => [
                    purchaseId, sellerId, l.itemId,
                    String(l.target.kind === "item" ? l.target.item.name : l.target.product.name).slice(0, 200),
                    l.quantity, l.unitCost, l.lineTotal
                ])]
            );

            const restocked = [];
            for (const l of priced) {
                const before = l.target.stock;
                const cost = exports.weightedAverageCost(before, toNum(l.target.item.cost_price), l.quantity, l.unitCost);
                await stockLedger.applyDelta(connection, l.target, l.quantity, {
                    type: "purchase", reason: `Purchase ${purchaseNo}`, refType: "purchase", refId: purchaseId,
                    unitCost: l.unitCost, createdBy: actor
                });
                await connection.query("UPDATE stock_items SET cost_price = ? WHERE id = ? AND seller_id = ?", [cost, l.itemId, sellerId]);
                l.target.item.cost_price = cost;
                if (l.target.kind === "product") restocked.push({ product: l.target.product, before, after: l.target.stock });
            }

            await trade.insertPayment(connection, {
                sellerId, direction: "out", amount: paid, method, purchaseId, supplierId: supplier ? supplier.id : null,
                kind: "purchase_payment", paidAt: when.date, createdBy: actor
            });
            return { purchaseId, purchaseNo, backdated: when.isBackdated, restocked };
        });

        if (outcome.existingId) return { purchase: await exports.getPurchase(sellerId, outcome.existingId), replayed: true };

        // Back-in-stock alerts, after commit, best effort (same as a manual restock).
        for (const r of outcome.restocked) {
            productAlertService.checkAndNotifyStockChange(
                { id: r.product.id, name: r.product.name, slug: r.product.slug, stock: r.after }, r.before
            ).catch(() => {});
        }
        if (outcome.backdated) {
            auditService.log({
                userId: actor, eventType: "stock.purchase_backdated",
                description: `Purchase ${outcome.purchaseNo} was dated ${when.date.toISOString()}`,
                metadata: { purchaseId: outcome.purchaseId }
            });
        }
        return { purchase: await exports.getPurchase(sellerId, outcome.purchaseId), replayed: false };
    } catch (error) {
        if (trade.isDuplicateKeyError(error) && idempotencyKey) {
            const [rows] = await db.query("SELECT id FROM purchases WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, idempotencyKey]);
            if (rows[0]) return { purchase: await exports.getPurchase(sellerId, rows[0].id), replayed: true };
        }
        throw error;
    }
};

exports.getPurchase = async (sellerId, purchaseId) => {
    const [rows] = await db.query("SELECT * FROM purchases WHERE id = ? AND seller_id = ?", [purchaseId, sellerId]);
    if (!rows[0]) throw fail("Purchase not found.", 404);
    const [lines] = await db.query("SELECT * FROM purchase_lines WHERE purchase_id = ? ORDER BY id", [purchaseId]);
    const [payments] = await db.query(
        "SELECT id, amount, method, note, paid_at FROM stock_payments WHERE purchase_id = ? AND seller_id = ? ORDER BY paid_at, id",
        [purchaseId, sellerId]
    );
    return {
        ...shapePurchase(rows[0]),
        lines: lines.map((l) => ({
            id: Number(l.id), stock_item_id: l.stock_item_id, item_name: l.item_name, quantity: Number(l.quantity),
            unit_cost: Number(l.unit_cost), line_total: Number(l.line_total)
        })),
        payments: payments.map((p) => ({ id: Number(p.id), amount: Number(p.amount), method: p.method, note: p.note, paid_at: p.paid_at }))
    };
};

exports.listPurchases = async (sellerId, query = {}) => {
    const { limit, page, offset } = trade.pageParams(query);
    const where = ["p.seller_id = ?"];
    const params = [sellerId];
    if (query.supplier_id) { where.push("p.supplier_id = ?"); params.push(Number(query.supplier_id)); }
    if (query.unpaid === "1" || query.unpaid === "true") where.push("p.total_amount > p.paid_amount");
    const q = String(query.q || "").trim().slice(0, 100);
    if (q) { where.push("(p.purchase_no LIKE ? OR p.invoice_no LIKE ? OR p.supplier_name LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (query.from) { where.push("p.purchased_at >= ?"); params.push(trade.dayStart(query.from)); }
    if (query.to) { where.push("p.purchased_at < ?"); params.push(trade.dayAfter(query.to)); }
    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
        `SELECT p.*, (SELECT COUNT(*) FROM purchase_lines l WHERE l.purchase_id = p.id) AS line_count
         FROM purchases p WHERE ${whereSql} ORDER BY p.purchased_at DESC, p.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[summary]] = await db.query(
        `SELECT COUNT(*) AS purchases, COALESCE(SUM(p.total_amount), 0) AS total,
                COALESCE(SUM(GREATEST(p.total_amount - p.paid_amount, 0)), 0) AS owed
         FROM purchases p WHERE ${whereSql}`,
        params
    );
    return {
        items: rows.map(shapePurchase), total: Number(summary.purchases), page, limit,
        summary: { total: Number(summary.total), owed: Number(summary.owed), currency: "TZS" }
    };
};

// Pay (part of) what is owed on one purchase.
exports.payPurchase = async (sellerId, purchaseId, input = {}, { createdBy } = {}) => {
    const amount = trade.money(input.amount, "Amount");
    if (!(amount > 0)) throw fail("Enter the amount paid.");
    const method = input.method || "cash";
    if (!trade.MONEY_METHODS.includes(method)) throw fail("Invalid payment method.");
    const batchKey = input.idempotencyKey || null;
    const payloadHash = stockLedger.hashPayload({ kind: "purchase_pay", purchaseId, amount, method, note: input.note || null });
    const actor = createdBy || sellerId;

    const replayed = await stockLedger.withTransaction(async (connection) => {
        const [rows] = await connection.query("SELECT * FROM purchases WHERE id = ? AND seller_id = ? FOR UPDATE", [purchaseId, sellerId]);
        const purchase = rows[0];
        if (!purchase) throw fail("Purchase not found.", 404);

        if (batchKey) {
            const [ex] = await connection.query(
                "SELECT payload_hash FROM stock_payments WHERE seller_id = ? AND batch_key = ? LIMIT 1", [sellerId, batchKey]
            );
            if (ex[0]) {
                if (ex[0].payload_hash && ex[0].payload_hash !== payloadHash) {
                    throw fail("This request id was already used for a different payment. Reload and try again.", 409);
                }
                return true;
            }
        }
        const owed = round2(Number(purchase.total_amount) - Number(purchase.paid_amount));
        if (owed <= 0) throw fail("This purchase is already paid.", 409);
        if (amount > owed) throw fail(`Only ${owed} is still owed on this purchase.`, 409);

        await connection.query("UPDATE purchases SET paid_amount = paid_amount + ? WHERE id = ?", [amount, purchaseId]);
        await trade.insertPayment(connection, {
            sellerId, direction: "out", amount, method, purchaseId, supplierId: purchase.supplier_id,
            kind: "purchase_payment", note: trade.clean(input.note, 255), batchKey, payloadHash, createdBy: actor
        });
        return false;
    });

    if (!replayed) {
        auditService.log({
            userId: actor, eventType: "stock.purchase_payment_made",
            description: `Paid ${amount} TZS towards purchase ${purchaseId}`, metadata: { purchaseId, amount, method }
        });
    }
    return { purchase: await exports.getPurchase(sellerId, purchaseId), replayed };
};

exports.supplierStatement = async (sellerId, supplierId) => {
    const supplier = await partiesService.get("supplier", sellerId, supplierId);
    const [rows] = await db.query(
        `SELECT p.*, (SELECT COUNT(*) FROM purchase_lines l WHERE l.purchase_id = p.id) AS line_count
         FROM purchases p WHERE p.seller_id = ? AND p.supplier_id = ? ORDER BY p.purchased_at DESC, p.id DESC LIMIT 100`,
        [sellerId, supplierId]
    );
    return { supplier, purchases: rows.map(shapePurchase) };
};
