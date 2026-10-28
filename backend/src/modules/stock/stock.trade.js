const { fail } = require("./stock.ledger");
const { todayInTz } = require("../../utils/dateTz");

// Shared helpers for the sales / purchases / customers services (Phase 7).

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
// A sale dated earlier than this much before "now" counts as back-dated and is
// logged. Tills are slow to save on bad networks, so a few minutes is normal.
const BACKDATE_NOTICE_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Africa/Dar_es_Salaam is UTC+3 all year (no daylight saving).
const DAR_OFFSET = "+03:00";

exports.PAYMENT_METHODS = ["cash", "mobile_money", "card", "bank_transfer", "credit", "other"];
// 'credit' is a way of selling (pay later), not a way of paying.
exports.MONEY_METHODS = ["cash", "mobile_money", "card", "bank_transfer", "other"];
exports.MAX_LINES = 100;
exports.MAX_AMOUNT = 1000000000;

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
exports.round2 = round2;

exports.money = (value, label = "Amount") => {
    const n = Number(value);
    if (value === undefined || value === null || value === "" || !Number.isFinite(n) || n < 0 || n > exports.MAX_AMOUNT) {
        throw fail(`${label} must be zero or more.`);
    }
    return round2(n);
};

exports.clean = (value, max) => {
    if (value === undefined || value === null) return null;
    const t = String(value).trim();
    return t === "" ? null : t.slice(0, max);
};

// "YYYY-MM-DD" in Dar es Salaam -> the UTC instant that day starts.
exports.dayStart = (dateStr) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) throw fail("Dates must look like 2026-10-27.");
    const d = new Date(`${dateStr}T00:00:00${DAR_OFFSET}`);
    if (Number.isNaN(d.getTime())) throw fail("Invalid date.");
    return d;
};
exports.dayAfter = (dateStr) => new Date(exports.dayStart(dateStr).getTime() + DAY_MS);

// The moment a sale / purchase is dated. Server clock when the client sends
// nothing. Never the future; never older than the allowed window. Returns
// whether it counts as back-dated (the caller logs those).
exports.resolveWhen = (input, maxBackdateDays, now = new Date()) => {
    if (input === undefined || input === null || input === "") return { date: now, isBackdated: false };
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) throw fail("Invalid date.");
    if (date.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) throw fail("The date can't be in the future.");
    const oldest = now.getTime() - maxBackdateDays * DAY_MS;
    if (date.getTime() < oldest) {
        throw fail(`The date can't be more than ${maxBackdateDays} day${maxBackdateDays === 1 ? "" : "s"} in the past.`);
    }
    return { date, isBackdated: now.getTime() - date.getTime() > BACKDATE_NOTICE_MS };
};

// Next receipt number for a seller. LAST_INSERT_ID(expr) makes the increment
// atomic and returns it on the same connection; the row lock it takes lasts to
// the end of the caller's transaction, so numbers are gap-free per seller.
exports.nextNumber = async (connection, sellerId, kind) => {
    await connection.query(
        `INSERT INTO stock_counters (seller_id, kind, counter_value) VALUES (?, ?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE counter_value = LAST_INSERT_ID(counter_value + 1)`,
        [sellerId, kind]
    );
    const [[row]] = await connection.query("SELECT LAST_INSERT_ID() AS n");
    const prefix = kind === "purchase" ? "P" : "R";
    return `${prefix}${String(Number(row.n)).padStart(6, "0")}`;
};

exports.isDuplicateKeyError = (error) => error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);

exports.pageParams = (query) => {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    return { limit, page, offset: (page - 1) * limit };
};

// Money-in / money-out row for the payments ledger.
exports.insertPayment = async (connection, p) => {
    if (!(Number(p.amount) > 0)) return null;
    const [result] = await connection.query(
        `INSERT INTO stock_payments
            (seller_id, direction, amount, method, sale_id, customer_id, purchase_id, supplier_id, kind, note,
             batch_key, payload_hash, paid_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            p.sellerId, p.direction, round2(p.amount), p.method || "cash", p.saleId || null, p.customerId || null,
            p.purchaseId || null, p.supplierId || null, p.kind, p.note || null, p.batchKey || null,
            p.payloadHash || null, p.paidAt || new Date(), p.createdBy || null
        ]
    );
    return result.insertId;
};

// What the customer still owes on a sale. Never stored - derived so it can't drift.
exports.balanceOf = (sale) =>
    Math.max(0, round2(Number(sale.total_amount) - Number(sale.returned_amount || 0) - Number(sale.paid_amount || 0)));

// ---------------------------------------------------------------- report ranges (Phase 8)

const ymd = (d) => d.toISOString().slice(0, 10);
// Calendar-day arithmetic on "YYYY-MM-DD" strings (no time zone involved).
exports.addDays = (dateStr, days) => ymd(new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * DAY_MS));

exports.today = (now = new Date()) => todayInTz(now);

// Report range from ?from=&to= as Dar es Salaam calendar days (inclusive).
// Default: the last `defaultDays` days ending today (Dar es Salaam). `start` /
// `endExclusive` are the UTC instants to compare timestamps against; `days` lists every
// day so a chart has no gaps.
exports.resolveRange = (query = {}, { defaultDays = 30, maxDays = 366, now = new Date() } = {}) => {
    const to = query.to || exports.today(now);
    const from = query.from || exports.addDays(to, -(defaultDays - 1));
    const start = exports.dayStart(from);
    const end = exports.dayStart(to);
    if (end < start) throw fail("The end date must be on or after the start date.");
    const count = Math.round((end - start) / DAY_MS) + 1;
    if (count > maxDays) throw fail("Choose a range of one year or less.");
    const days = [];
    for (let i = 0; i < count; i += 1) days.push(exports.addDays(from, i));
    return { from, to, start, endExclusive: exports.dayAfter(to), days };
};

// SQL: the Dar es Salaam calendar day ("YYYY-MM-DD") of a column. Needs no time-zone tables.
//   "timestamp" columns (orders.created_at ...) are shown by MySQL in the session zone, so we
//     shift by the difference between UTC+3 and that zone;
//   "datetime" columns (sales.sold_at, stock_payments.paid_at ...) hold the wall-clock time the
//     Node driver wrote, i.e. the Node process's zone, so we shift by the difference to UTC+3.
// On a server running in UTC both shifts are simply +3 hours.
exports.darDaySql = (column, stored = "timestamp") => {
    if (stored === "datetime") {
        const shift = 10800 + new Date().getTimezoneOffset() * 60;
        return `DATE_FORMAT(${column} + INTERVAL ${Math.trunc(shift)} SECOND, '%Y-%m-%d')`;
    }
    return `DATE_FORMAT(${column} + INTERVAL (10800 - TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) SECOND, '%Y-%m-%d')`;
};

// "YYYY-MM-DD" of an instant as seen in Dar es Salaam.
exports.dateKey = (value) => todayInTz(new Date(value));
