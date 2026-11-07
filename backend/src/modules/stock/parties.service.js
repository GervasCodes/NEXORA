const db = require("../../config/db");
const stockLedger = require("./stock.ledger");
const auditService = require("../audit/audit.service");
const trade = require("./stock.trade");

const { fail } = stockLedger;
const { round2 } = trade;

// Nexora Stock Management (Phase 7): a seller's own customers (with what they
// owe) and suppliers (with what the seller owes). Every query is scoped to the
// seller; a customer or supplier is never visible to anyone else.

const KINDS = {
    customer: { table: "stock_customers", label: "Customer" },
    supplier: { table: "stock_suppliers", label: "Supplier" }
};

const shape = (row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone || null,
    note: row.note || null,
    is_archived: !!row.is_archived,
    owed: row.owed === undefined ? undefined : Number(row.owed),
    created_at: row.created_at
});

// Customer owes the seller: open (not cancelled) sales. Seller owes supplier: purchases.
const OWED_SQL = {
    customer: `(SELECT COALESCE(SUM(GREATEST(s.total_amount - s.returned_amount - s.paid_amount, 0)), 0)
                FROM sales s WHERE s.seller_id = p.seller_id AND s.customer_id = p.id AND s.voided_at IS NULL)`,
    supplier: `(SELECT COALESCE(SUM(GREATEST(x.total_amount - x.paid_amount, 0)), 0)
                FROM purchases x WHERE x.seller_id = p.seller_id AND x.supplier_id = p.id)`
};

exports.list = async (kind, sellerId, query = {}) => {
    const { table } = KINDS[kind];
    const { limit, page, offset } = trade.pageParams(query);
    const where = ["p.seller_id = ?", "p.is_archived = ?"];
    const params = [sellerId, query.archived === "1" || query.archived === "true" ? 1 : 0];
    const q = String(query.q || "").trim().slice(0, 100);
    if (q) { where.push("(p.name LIKE ? OR p.phone LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
    if (query.owing === "1" || query.owing === "true") where.push(`${OWED_SQL[kind]} > 0`);
    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
        `SELECT p.*, ${OWED_SQL[kind]} AS owed FROM ${table} p WHERE ${whereSql} ORDER BY p.name ASC, p.id ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM ${table} p WHERE ${whereSql}`, params);
    const [[{ owed }]] = await db.query(
        `SELECT COALESCE(SUM(${OWED_SQL[kind]}), 0) AS owed FROM ${table} p WHERE p.seller_id = ? AND p.is_archived = 0`, [sellerId]
    );
    return { items: rows.map(shape), total: Number(total), page, limit, total_owed: Number(owed) };
};

exports.create = async (kind, sellerId, data) => {
    const { table, label } = KINDS[kind];
    const name = trade.clean(data.name, 120);
    if (!name) throw fail(`${label} name is required.`);
    try {
        const [r] = await db.query(
            `INSERT INTO ${table} (seller_id, name, phone, note) VALUES (?, ?, ?, ?)`,
            [sellerId, name, trade.clean(data.phone, 30), trade.clean(data.note, 255)]
        );
        return exports.get(kind, sellerId, r.insertId);
    } catch (error) {
        if (trade.isDuplicateKeyError(error)) throw fail(`You already have a ${label.toLowerCase()} with this phone number.`, 409);
        throw error;
    }
};

exports.update = async (kind, sellerId, id, data) => {
    const { table, label } = KINDS[kind];
    await exports.get(kind, sellerId, id);
    const sets = [];
    const params = [];
    if (data.name !== undefined) {
        const name = trade.clean(data.name, 120);
        if (!name) throw fail(`${label} name is required.`);
        sets.push("name = ?"); params.push(name);
    }
    if (data.phone !== undefined) { sets.push("phone = ?"); params.push(trade.clean(data.phone, 30)); }
    if (data.note !== undefined) { sets.push("note = ?"); params.push(trade.clean(data.note, 255)); }
    if (data.isArchived !== undefined) { sets.push("is_archived = ?"); params.push(data.isArchived ? 1 : 0); }
    if (sets.length) {
        try {
            await db.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? AND seller_id = ?`, [...params, id, sellerId]);
        } catch (error) {
            if (trade.isDuplicateKeyError(error)) throw fail(`You already have a ${label.toLowerCase()} with this phone number.`, 409);
            throw error;
        }
    }
    return exports.get(kind, sellerId, id);
};

exports.get = async (kind, sellerId, id) => {
    const { table, label } = KINDS[kind];
    const [rows] = await db.query(
        `SELECT p.*, ${OWED_SQL[kind]} AS owed FROM ${table} p WHERE p.id = ? AND p.seller_id = ?`, [id, sellerId]
    );
    if (!rows[0]) throw fail(`${label} not found.`, 404);
    return shape(rows[0]);
};

// Customer detail: what they owe, by sale, and the payments they made.
exports.customerStatement = async (sellerId, customerId) => {
    const customer = await exports.get("customer", sellerId, customerId);
    const [sales] = await db.query(
        `SELECT id, receipt_no, sold_at, total_amount, returned_amount, paid_amount, payment_method, voided_at
         FROM sales WHERE seller_id = ? AND customer_id = ? ORDER BY sold_at DESC, id DESC LIMIT 100`,
        [sellerId, customerId]
    );
    const [payments] = await db.query(
        `SELECT id, sale_id, amount, method, kind, paid_at FROM stock_payments
         WHERE seller_id = ? AND customer_id = ? AND kind = 'debt_payment' ORDER BY paid_at DESC, id DESC LIMIT 100`,
        [sellerId, customerId]
    );
    return {
        customer,
        sales: sales.map((s) => ({
            id: Number(s.id), receipt_no: s.receipt_no, sold_at: s.sold_at, total_amount: Number(s.total_amount),
            payment_method: s.payment_method, status: s.voided_at ? "voided" : "active",
            balance: s.voided_at ? 0 : trade.balanceOf(s)
        })),
        payments: payments.map((p) => ({
            id: Number(p.id), sale_id: p.sale_id ? Number(p.sale_id) : null, amount: Number(p.amount), method: p.method, paid_at: p.paid_at
        }))
    };
};

// A customer pays towards what they owe. The money is applied to the oldest
// unpaid sales first; the amount can't be more than the total owed. The
// customer row is locked first, so two payments at once can't both use the
// same debt, and a repeated request id replays instead of paying twice.
exports.receiveCustomerPayment = async (sellerId, customerId, input = {}, { createdBy } = {}) => {
    const amount = trade.money(input.amount, "Amount");
    if (!(amount > 0)) throw fail("Enter the amount received.");
    const method = input.method || "cash";
    if (!trade.MONEY_METHODS.includes(method)) throw fail("Invalid payment method.");
    const batchKey = input.idempotencyKey || null;
    const payloadHash = stockLedger.hashPayload({ kind: "debt", customerId, amount, method, note: input.note || null });
    const actor = createdBy || sellerId;

    const outcome = await stockLedger.withTransaction(async (connection) => {
        const [cust] = await connection.query(
            "SELECT id FROM stock_customers WHERE id = ? AND seller_id = ? FOR UPDATE", [customerId, sellerId]
        );
        if (!cust[0]) throw fail("Customer not found.", 404);

        if (batchKey) {
            const [ex] = await connection.query(
                "SELECT payload_hash FROM stock_payments WHERE seller_id = ? AND batch_key = ? LIMIT 1", [sellerId, batchKey]
            );
            if (ex[0]) {
                if (ex[0].payload_hash && ex[0].payload_hash !== payloadHash) {
                    throw fail("This request id was already used for a different payment. Reload and try again.", 409);
                }
                return { replayed: true };
            }
        }

        const [open] = await connection.query(
            `SELECT id, total_amount, returned_amount, paid_amount FROM sales
             WHERE seller_id = ? AND customer_id = ? AND voided_at IS NULL
               AND (total_amount - returned_amount - paid_amount) > 0
             ORDER BY sold_at ASC, id ASC FOR UPDATE`,
            [sellerId, customerId]
        );
        const owed = round2(open.reduce((s, r) => s + trade.balanceOf(r), 0));
        if (owed <= 0) throw fail("This customer doesn't owe anything.", 409);
        if (amount > owed) throw fail(`The customer only owes ${owed}. Enter that amount or less.`, 409);

        let left = amount;
        const now = new Date();
        for (const sale of open) {
            if (left <= 0) break;
            const part = Math.min(left, trade.balanceOf(sale));
            if (part <= 0) continue;
            await connection.query("UPDATE sales SET paid_amount = paid_amount + ? WHERE id = ?", [part, sale.id]);
            await trade.insertPayment(connection, {
                sellerId, direction: "in", amount: part, method, saleId: sale.id, customerId, kind: "debt_payment",
                note: trade.clean(input.note, 255), batchKey, payloadHash, paidAt: now, createdBy: actor
            });
            left = round2(left - part);
        }
        return { owed, remaining: round2(owed - amount) };
    });

    if (!outcome.replayed) {
        auditService.log({
            userId: actor, eventType: "stock.debt_payment_received",
            description: `Customer ${customerId} paid ${amount} TZS towards a debt`,
            metadata: { customerId, amount, method }
        });
    }
    return { ...outcome, statement: await exports.customerStatement(sellerId, customerId) };
};
