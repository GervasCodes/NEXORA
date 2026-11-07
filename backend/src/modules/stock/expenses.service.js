const db = require("../../config/db");
const stockLedger = require("./stock.ledger");
const auditService = require("../audit/audit.service");
const trade = require("./stock.trade");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const { stripImageMetadata } = require("../../utils/imageSanitize");

const { fail } = stockLedger;
const { round2 } = trade;

// Nexora Stock Management (Phase 8): expenses - money the business spent that is not
// stock (rent, transport, wages...). They reduce profit in the reports. Each belongs to
// one seller; an expense is never edited silently: to correct one you void it (it stays
// on record with its reason, out of every total) and enter a new one.

exports.CATEGORIES = [
    "rent", "transport", "salaries", "electricity_water", "airtime_internet",
    "packaging", "tax_licence", "repairs", "marketing", "other"
];
const MAX_BACK_DAYS = 400;

const shape = (row) => ({
    id: Number(row.id),
    category: row.category,
    amount: Number(row.amount),
    expense_date: typeof row.expense_date === "string" ? row.expense_date : trade.dateKey(row.expense_date),
    note: row.note || null,
    receipt_url: row.receipt_url || null,
    status: row.voided_at ? "voided" : "active",
    voided_at: row.voided_at || null,
    void_reason: row.void_reason || null,
    created_at: row.created_at
});

// expense_date is a DATE: read it back as "YYYY-MM-DD" text, never as a JS Date that a
// time zone could shift by a day.
const SELECT = `SELECT id, category, amount, DATE_FORMAT(expense_date, '%Y-%m-%d') AS expense_date, note, receipt_url,
                       voided_at, void_reason, created_at FROM stock_expenses`;

exports.create = async (sellerId, input = {}, { createdBy, file } = {}) => {
    const category = String(input.category || "");
    if (!exports.CATEGORIES.includes(category)) throw fail("Choose an expense category.");
    const amount = trade.money(input.amount, "Amount");
    if (!(amount > 0)) throw fail("Enter the amount spent.");

    const today = trade.today();
    const date = input.expenseDate || today;
    trade.dayStart(date); // validates the format
    if (date > today) throw fail("The date can't be in the future.");
    if (date < trade.addDays(today, -MAX_BACK_DAYS)) throw fail("The date is too far in the past.");

    const note = trade.clean(input.note, 255);
    const key = input.idempotencyKey || null;
    const payloadHash = stockLedger.hashPayload({ category, amount, date, note, hasReceipt: !!file });
    const actor = createdBy || sellerId;

    if (key) {
        const [ex] = await db.query(`${SELECT} WHERE seller_id = ? AND idempotency_key = ? LIMIT 1`, [sellerId, key]);
        const [hash] = await db.query("SELECT payload_hash FROM stock_expenses WHERE seller_id = ? AND idempotency_key = ? LIMIT 1", [sellerId, key]);
        if (ex[0]) {
            if (hash[0] && hash[0].payload_hash && hash[0].payload_hash !== payloadHash) {
                throw fail("This request id was already used for a different expense. Reload and try again.", 409);
            }
            return { expense: shape(ex[0]), replayed: true };
        }
    }

    let receipt = { url: null, publicId: null };
    if (file) {
        // Strip location/EXIF from the photo before it leaves the server.
        const clean = await stripImageMetadata(file.buffer);
        const uploaded = await uploadToCloudinary(clean, "stock/receipts");
        receipt = { url: uploaded.secure_url, publicId: uploaded.public_id };
    }

    try {
        const [r] = await db.query(
            `INSERT INTO stock_expenses
                (seller_id, category, amount, expense_date, note, receipt_url, receipt_public_id, idempotency_key, payload_hash, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sellerId, category, amount, date, note, receipt.url, receipt.publicId, key, payloadHash, actor]
        );
        auditService.log({
            userId: actor, eventType: "stock.expense_created",
            description: `Expense ${r.insertId}: ${category} ${amount} TZS`, metadata: { expenseId: r.insertId, category, amount, date }
        });
        return { expense: await exports.get(sellerId, r.insertId), replayed: false };
    } catch (error) {
        if (trade.isDuplicateKeyError(error) && key) {
            const [ex] = await db.query(`${SELECT} WHERE seller_id = ? AND idempotency_key = ? LIMIT 1`, [sellerId, key]);
            if (ex[0]) return { expense: shape(ex[0]), replayed: true };
        }
        throw error;
    }
};

exports.get = async (sellerId, id) => {
    const [rows] = await db.query(`${SELECT} WHERE id = ? AND seller_id = ?`, [id, sellerId]);
    if (!rows[0]) throw fail("Expense not found.", 404);
    return shape(rows[0]);
};

exports.list = async (sellerId, query = {}) => {
    const range = trade.resolveRange(query, { defaultDays: 30 });
    const { limit, page, offset } = trade.pageParams(query);
    const where = ["seller_id = ?", "expense_date >= ?", "expense_date <= ?"];
    const params = [sellerId, range.from, range.to];
    if (query.category) {
        if (!exports.CATEGORIES.includes(query.category)) throw fail("Unknown category.");
        where.push("category = ?"); params.push(query.category);
    }
    const showVoided = query.status === "voided" || query.status === "all";
    if (query.status === "voided") where.push("voided_at IS NOT NULL");
    else if (!showVoided) where.push("voided_at IS NULL");
    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
        `${SELECT} WHERE ${whereSql} ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM stock_expenses WHERE ${whereSql}`, params);
    // Totals never include voided expenses, whatever is being listed.
    const [byCategory] = await db.query(
        `SELECT category, SUM(amount) AS amount FROM stock_expenses
         WHERE seller_id = ? AND expense_date >= ? AND expense_date <= ? AND voided_at IS NULL GROUP BY category ORDER BY amount DESC`,
        [sellerId, range.from, range.to]
    );
    const sum = round2(byCategory.reduce((s, r) => s + Number(r.amount), 0));
    return {
        from: range.from, to: range.to, items: rows.map(shape), total: Number(total), page, limit,
        total_amount: sum, by_category: byCategory.map((r) => ({ category: r.category, amount: Number(r.amount) }))
    };
};

exports.void = async (sellerId, id, { reason } = {}, { createdBy } = {}) => {
    const expense = await exports.get(sellerId, id);
    if (expense.status === "voided") return expense;
    const [r] = await db.query(
        "UPDATE stock_expenses SET voided_at = NOW(), void_reason = ? WHERE id = ? AND seller_id = ? AND voided_at IS NULL",
        [trade.clean(reason, 255), id, sellerId]
    );
    if (r.affectedRows) {
        auditService.log({
            userId: createdBy || sellerId, eventType: "stock.expense_voided",
            description: `Expense ${id} voided`, metadata: { expenseId: id, amount: expense.amount, reason: reason || null }
        });
    }
    return exports.get(sellerId, id);
};
