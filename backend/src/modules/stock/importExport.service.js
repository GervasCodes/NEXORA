const crypto = require("crypto");
const db = require("../../config/db");
const stockLedger = require("./stock.ledger");
const stockService = require("./stock.service");
const reports = require("./reports.service");
const auditService = require("../audit/audit.service");
const trade = require("./stock.trade");
const tabular = require("./stock.tabular");

const { fail } = stockLedger;

// Nexora Stock Management (Phase 8): import items / opening stock from CSV or XLSX, with a
// dry-run preview, and export sales / purchases / movements / valuation / items as CSV.
//
// Import rules (kept deliberately safe - a spreadsheet is easy to get wrong):
//   - a row matches an existing item by barcode, then SKU, then exact name (external items
//     only). A match UPDATES price / cost / reorder level / unit / SKU / barcode (blank cells
//     leave the value alone); it never changes stock, because a count is a stock correction,
//     not an import. No match creates an external item with its opening stock.
//   - a Nexora-listed item keeps its name and price from the listing (those cells are ignored).
//   - the preview (dry run) and the real run use the same code, so what you see is what happens.
//   - one bad row never blocks the others; rows with errors are skipped and listed.
//   - running the same file twice changes nothing the second time.

const COLUMNS = {
    name: ["name", "item", "item name", "product", "jina", "bidhaa", "jina la bidhaa"],
    sku: ["sku", "code", "item code", "msimbo"],
    barcode: ["barcode", "bar code", "upau", "barcode/upau"],
    unit: ["unit", "kipimo", "uom"],
    cost_price: ["cost price", "cost", "buying price", "bei ya kununua", "bei ya ununuzi", "cost_price"],
    sell_price: ["selling price", "sell price", "price", "bei ya kuuza", "bei", "sell_price", "selling_price"],
    reorder_level: ["reorder level", "reorder", "low stock level", "kiwango cha kuagiza", "reorder_level", "kiwango cha chini"],
    opening_stock: ["opening stock", "stock", "quantity", "qty", "stoku ya kuanzia", "stoku", "idadi", "opening_stock"]
};
const ALIAS = new Map();
Object.entries(COLUMNS).forEach(([field, names]) => names.forEach((n) => ALIAS.set(n, field)));

const normHeader = (h) => String(h || "").replace(/^﻿/, "").trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");

const HEADERS = {
    en: ["Name", "SKU", "Barcode", "Unit", "Cost price", "Selling price", "Reorder level", "Opening stock"],
    sw: ["Jina", "SKU", "Barcode", "Kipimo", "Bei ya kununua", "Bei ya kuuza", "Kiwango cha kuagiza", "Stoku ya kuanzia"]
};
const SAMPLE = {
    en: [["Sugar 1kg", "SUG-1", "6001234567890", "pcs", "2400", "3000", "10", "50"], ["Cooking oil 5L", "OIL-5", "", "pcs", "18000", "21500", "5", "12"]],
    sw: [["Sukari kilo 1", "SUG-1", "6001234567890", "pcs", "2400", "3000", "10", "50"], ["Mafuta ya kupikia lita 5", "OIL-5", "", "pcs", "18000", "21500", "5", "12"]]
};

exports.template = (lang = "en") => {
    const l = lang === "sw" ? "sw" : "en";
    return { filename: `nexora-items-template-${l}.csv`, csv: tabular.toCsv(HEADERS[l], SAMPLE[l]) };
};

// "1,500", "TSh 2 400", "2400.50", "2,5" -> number, or NaN.
const toNumber = (raw) => {
    let s = String(raw).trim().replace(/\s+/g, "").replace(/^(tzs|tsh|sh|\/=)/i, "").replace(/(\/=)$/, "");
    if (s === "") return null;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
};
exports.toNumber = toNumber;

const loadExisting = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT id, source, product_id, name, sku, barcode, unit, cost_price, sell_price, reorder_level, is_archived
         FROM stock_items WHERE seller_id = ? LIMIT 50000`, [sellerId]
    );
    const byBarcode = new Map(); const bySku = new Map(); const byName = new Map();
    rows.forEach((r) => {
        if (r.barcode) byBarcode.set(String(r.barcode).toLowerCase(), r);
        if (r.sku && !bySku.has(String(r.sku).toLowerCase())) bySku.set(String(r.sku).toLowerCase(), r);
        if (r.source === "external" && !r.is_archived && !byName.has(String(r.name).toLowerCase())) byName.set(String(r.name).toLowerCase(), r);
    });
    return { rows, byBarcode, bySku, byName };
};

// Reads the sheet into per-row plans. No database writes.
const plan = async (sellerId, sheet) => {
    if (sheet.length === 0) throw fail("The file is empty.");
    const header = sheet[0].map(normHeader);
    const fieldAt = header.map((h) => ALIAS.get(h) || null);
    if (!fieldAt.includes("name")) {
        throw fail("The first row must have column names, including \"Name\" (\"Jina\"). Download the template to see the layout.");
    }
    const ignored = sheet[0].filter((h, i) => !fieldAt[i] && String(h).trim() !== "").map((h) => String(h).trim());
    const body = sheet.slice(1);
    if (!body.some((r) => r.some((c) => String(c).trim() !== ""))) throw fail("The file has no items below the column names.");
    if (body.length > tabular.MAX_ROWS) throw fail(`Import at most ${tabular.MAX_ROWS} items at a time. Split the file and try again.`);

    const existing = await loadExisting(sellerId);
    const seenBarcode = new Map();
    const entries = body.map((cells, i) => ({ cells, rowNumber: i + 2 })) // as the seller sees it in the spreadsheet
        .filter(({ cells }) => cells.some((c) => String(c).trim() !== ""))
        .map(({ cells, rowNumber }) => {
        const raw = {};
        fieldAt.forEach((f, idx) => { if (f) raw[f] = cells[idx] === undefined ? "" : String(cells[idx]).trim(); });
        const errors = []; const warnings = [];
        const data = {};

        const num = (field, label, { integer = false, max = 1000000000 } = {}) => {
            if (raw[field] === undefined || raw[field] === "") return;
            const n = toNumber(raw[field]);
            if (n === null || Number.isNaN(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) {
                errors.push({ field, message: integer ? `${label} must be a whole number, zero or more.` : `${label} must be a number, zero or more.` });
            } else data[field] = n;
        };
        num("cost_price", "Cost price"); num("sell_price", "Selling price");
        num("reorder_level", "Reorder level", { integer: true, max: 100000 });
        num("opening_stock", "Opening stock", { integer: true, max: 100000000 });
        ["name", "sku", "barcode", "unit"].forEach((f) => { if (raw[f]) data[f] = raw[f]; });
        if (data.name && data.name.length > 200) errors.push({ field: "name", message: "Name is longer than 200 characters." });
        if (data.sku && data.sku.length > 64) errors.push({ field: "sku", message: "SKU is longer than 64 characters." });
        if (data.barcode && data.barcode.length > 64) errors.push({ field: "barcode", message: "Barcode is longer than 64 characters." });
        if (data.unit && data.unit.length > 20) errors.push({ field: "unit", message: "Unit is longer than 20 characters." });

        let match = null; let matchedBy = null;
        if (data.barcode && existing.byBarcode.has(data.barcode.toLowerCase())) { match = existing.byBarcode.get(data.barcode.toLowerCase()); matchedBy = "barcode"; }
        else if (data.sku && existing.bySku.has(data.sku.toLowerCase())) { match = existing.bySku.get(data.sku.toLowerCase()); matchedBy = "sku"; }
        else if (data.name && existing.byName.has(data.name.toLowerCase())) { match = existing.byName.get(data.name.toLowerCase()); matchedBy = "name"; }

        if (data.barcode) {
            const key = data.barcode.toLowerCase();
            if (seenBarcode.has(key)) errors.push({ field: "barcode", message: `Same barcode as row ${seenBarcode.get(key)}.` });
            else seenBarcode.set(key, rowNumber);
        }
        if (!match && !data.name) errors.push({ field: "name", message: "Name is required for a new item." });

        let action;
        if (errors.length) action = "error";
        else if (match) {
            action = "update";
            if (matchedBy === "name") warnings.push("Matched an existing item by name.");
            if (data.opening_stock !== undefined) warnings.push("Stock of an existing item isn't changed by an import. Use a stock count to correct it.");
            if (match.source === "nexora" && (data.name || data.sell_price !== undefined)) warnings.push("Name and price of an item listed on Nexora come from its listing and are ignored.");
        } else action = "create";
        return { row: rowNumber, action, errors, warnings, data, match_id: match ? match.id : null, matched_by: matchedBy };
    });
    return { entries, ignored_columns: ignored, activeItems: existing.rows.filter((r) => !r.is_archived).length };
};

const summarise = (entries) => entries.reduce((s, e) => { s[e.action] += 1; return s; }, { create: 0, update: 0, error: 0 });

const limitWarning = (activeItems, creates, access) => {
    const max = access && access.features ? access.features.stock_max_items : null;
    if (max === null || max === undefined) return null;
    if (activeItems + creates > max) {
        return { max_items: max, would_have: activeItems + creates,
            message: `This would bring you to ${activeItems + creates} items. Your plan is meant for up to ${max}. Nothing is blocked, but consider upgrading.` };
    }
    return null;
};

exports.previewItems = async (sellerId, file, access) => {
    let sheet;
    try { sheet = tabular.readUpload(file); } catch (error) { throw fail(error.message); }
    const p = await plan(sellerId, sheet);
    return {
        dry_run: true, summary: summarise(p.entries), ignored_columns: p.ignored_columns,
        limit_warning: limitWarning(p.activeItems, summarise(p.entries).create, access),
        rows: p.entries.slice(0, 500), rows_truncated: p.entries.length > 500
    };
};

exports.applyItems = async (sellerId, file, { idempotencyKey, createdBy, access } = {}) => {
    let sheet;
    try { sheet = tabular.readUpload(file); } catch (error) { throw fail(error.message); }
    const p = await plan(sellerId, sheet);
    const batch = crypto.createHash("sha1").update(String(idempotencyKey || crypto.randomUUID())).digest("hex").slice(0, 12);
    const actor = createdBy || sellerId;

    const results = [];
    for (const e of p.entries) {
        if (e.action === "error") { results.push({ row: e.row, status: "skipped", errors: e.errors }); continue; }
        try {
            if (e.action === "create") {
                const d = e.data;
                const item = await stockService.createItem(sellerId, {
                    name: d.name, sku: d.sku, barcode: d.barcode, unit: d.unit, costPrice: d.cost_price,
                    sellPrice: d.sell_price, reorderLevel: d.reorder_level, openingStock: d.opening_stock,
                    idempotencyKey: `imp${batch}r${e.row}`
                }, { createdBy: actor });
                results.push({ row: e.row, status: "created", item_id: item.id });
            } else {
                const d = e.data;
                const patch = {};
                if (d.sku !== undefined) patch.sku = d.sku;
                if (d.barcode !== undefined) patch.barcode = d.barcode;
                if (d.unit !== undefined) patch.unit = d.unit;
                if (d.cost_price !== undefined) patch.costPrice = d.cost_price;
                if (d.reorder_level !== undefined) patch.reorderLevel = d.reorder_level;
                const listed = (await stockService.getItem(sellerId, e.match_id)).source === "nexora";
                if (!listed) {
                    if (d.name !== undefined) patch.name = d.name;
                    if (d.sell_price !== undefined) patch.sellPrice = d.sell_price;
                }
                await stockService.updateItem(sellerId, e.match_id, patch);
                results.push({ row: e.row, status: "updated", item_id: e.match_id });
            }
        } catch (error) {
            results.push({ row: e.row, status: "failed", errors: [{ message: error.message }] });
        }
    }

    const count = (s) => results.filter((r) => r.status === s).length;
    auditService.log({
        userId: actor, eventType: "stock.import_applied",
        description: `Item import: ${count("created")} created, ${count("updated")} updated`,
        metadata: { created: count("created"), updated: count("updated"), skipped: count("skipped"), failed: count("failed"), rows: p.entries.length }
    });
    return {
        dry_run: false,
        summary: { created: count("created"), updated: count("updated"), skipped: count("skipped"), failed: count("failed") },
        limit_warning: limitWarning(p.activeItems, count("created"), access),
        rows: results.filter((r) => r.status === "skipped" || r.status === "failed").slice(0, 500)
    };
};

// ------------------------------------------------------------------- export

const MAX_EXPORT_ROWS = 50000;
const dateStamp = () => trade.today();

const ensureWithin = (rows) => {
    if (rows.length > MAX_EXPORT_ROWS) throw fail(`That's more than ${MAX_EXPORT_ROWS} rows. Choose a shorter date range.`);
    return rows;
};

const ITEM_LIVE = "COALESCE(v.stock, p.stock, si.stock)";

exports.KINDS = ["items", "sales", "purchases", "movements", "valuation"];

exports.exportCsv = async (sellerId, kind, query = {}, access, { actor } = {}) => {
    if (!exports.KINDS.includes(kind)) throw fail("Unknown export.", 404);
    const withCost = reports.hasCost(access);
    let out;

    if (kind === "items") {
        const [rows] = await db.query(
            `SELECT COALESCE(CASE WHEN si.source = 'nexora' THEN p.name END, si.name) AS name, si.sku, si.barcode, si.unit,
                    si.cost_price, si.sell_price, si.reorder_level, ${ITEM_LIVE} AS stock
             FROM stock_items si LEFT JOIN products p ON p.id = si.product_id LEFT JOIN product_variants v ON v.id = si.variant_id
             WHERE si.seller_id = ? AND si.is_archived = 0 ORDER BY name ASC LIMIT ?`, [sellerId, MAX_EXPORT_ROWS + 1]
        );
        ensureWithin(rows);
        out = tabular.toCsv(
            ["Name", "SKU", "Barcode", "Unit", "Cost price", "Selling price", "Reorder level", "Stock"],
            rows.map((r) => [r.name, r.sku, r.barcode, r.unit, withCost && r.cost_price !== null ? Number(r.cost_price) : null,
                Number(r.sell_price), Number(r.reorder_level), Number(r.stock)])
        );
    } else if (kind === "valuation") {
        if (!withCost) { const e = fail("Your plan doesn't include cost and profit reports.", 403); e.code = "FEATURE_NOT_IN_PLAN"; throw e; }
        const rows = ensureWithin(await reports.valuationRows(sellerId));
        out = tabular.toCsv(["Name", "Unit", "Stock", "Cost price", "Selling price", "Value at cost", "Value at selling price"],
            rows.map((r) => [r.name, r.unit, r.stock, r.cost_price, r.sell_price, r.value_at_cost, r.value_at_retail]));
    } else {
        const range = trade.resolveRange(query, { defaultDays: 30 });
        if (kind === "sales") {
            const [rows] = await db.query(
                `SELECT receipt_no, sold_at, customer_name, payment_method, voided_at, subtotal, discount_amount, total_amount,
                        returned_amount, paid_amount, is_offline, stock_flagged, note
                 FROM sales WHERE seller_id = ? AND sold_at >= ? AND sold_at < ? ORDER BY sold_at ASC, id ASC LIMIT ?`,
                [sellerId, range.start, range.endExclusive, MAX_EXPORT_ROWS + 1]
            );
            ensureWithin(rows);
            out = tabular.toCsv(
                ["Receipt", "Date", "Customer", "Payment", "Status", "Subtotal", "Discount", "Total", "Returned", "Net", "Paid", "Balance owed", "Offline sale", "Note"],
                rows.map((r) => {
                    const voided = !!r.voided_at;
                    return [r.receipt_no, tabular.darDateTime(r.sold_at), r.customer_name, r.payment_method, voided ? "voided" : "active",
                        Number(r.subtotal), Number(r.discount_amount), Number(r.total_amount), Number(r.returned_amount),
                        trade.round2(Number(r.total_amount) - Number(r.returned_amount)), Number(r.paid_amount),
                        voided ? 0 : trade.balanceOf(r), r.is_offline ? "yes" : "no", r.note];
                })
            );
        } else if (kind === "purchases") {
            const [rows] = await db.query(
                `SELECT purchase_no, purchased_at, supplier_name, invoice_no, total_amount, paid_amount, note
                 FROM purchases WHERE seller_id = ? AND purchased_at >= ? AND purchased_at < ? ORDER BY purchased_at ASC, id ASC LIMIT ?`,
                [sellerId, range.start, range.endExclusive, MAX_EXPORT_ROWS + 1]
            );
            ensureWithin(rows);
            out = tabular.toCsv(["Purchase", "Date", "Supplier", "Invoice", "Total", "Paid", "Balance owed", "Note"],
                rows.map((r) => [r.purchase_no, tabular.darDateTime(r.purchased_at), r.supplier_name, r.invoice_no, Number(r.total_amount),
                    Number(r.paid_amount), Math.max(0, trade.round2(Number(r.total_amount) - Number(r.paid_amount))), r.note]));
        } else {
            const [rows] = await db.query(
                `SELECT m.created_at, COALESCE(CASE WHEN si.source = 'nexora' THEN p.name END, si.name) AS name, m.type,
                        m.quantity_change, m.stock_before, m.stock_after, m.unit_cost, m.reason
                 FROM stock_movements m JOIN stock_items si ON si.id = m.stock_item_id LEFT JOIN products p ON p.id = si.product_id
                 WHERE m.seller_id = ? AND m.created_at >= ? AND m.created_at < ? ORDER BY m.created_at ASC, m.id ASC LIMIT ?`,
                [sellerId, range.start, range.endExclusive, MAX_EXPORT_ROWS + 1]
            );
            ensureWithin(rows);
            out = tabular.toCsv(["Date", "Item", "Type", "Change", "Stock before", "Stock after", "Unit cost", "Reason"],
                rows.map((r) => [tabular.darDateTime(r.created_at), r.name, r.type, Number(r.quantity_change), Number(r.stock_before),
                    Number(r.stock_after), withCost && r.unit_cost !== null ? Number(r.unit_cost) : null, r.reason]));
        }
        auditService.log({ userId: actor || sellerId, eventType: "stock.export_downloaded", description: `Exported ${kind}`, metadata: { kind, from: range.from, to: range.to } });
        return { filename: `nexora-${kind}-${range.from}_${range.to}.csv`, csv: out };
    }
    auditService.log({ userId: actor || sellerId, eventType: "stock.export_downloaded", description: `Exported ${kind}`, metadata: { kind } });
    return { filename: `nexora-${kind}-${dateStamp()}.csv`, csv: out };
};
