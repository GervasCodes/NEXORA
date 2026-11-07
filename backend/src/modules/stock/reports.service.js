const db = require("../../config/db");
const trade = require("./stock.trade");
const { fail } = require("./stock.ledger");

const { round2 } = trade;

// Nexora Stock Management (Phase 8): reports.
//
// Two kinds of sales are kept apart in every report that talks about revenue:
//   on-platform   orders customers paid for on Nexora. Revenue is what the seller is actually
//                 credited - the order line's seller_net_amount (price minus commission),
//                 reduced in proportion to anything refunded. Only lines the wallet has
//                 credited (wallet_credited) and that were not charged back count, so these
//                 figures agree with the wallet.
//   off-platform  sales the seller rang up on the till (the `sales` table, including those
//                 copied from the old sales screen). Revenue is the sale total minus goods
//                 returned; cancelled (voided) sales never count.
// Every date range is whole Africa/Dar_es_Salaam calendar days (trade.resolveRange) and
// every day label in a chart is the Dar es Salaam day (trade.darDaySql).
//
// Anything that reveals what the seller PAID for goods (profit, valuation, cost columns) is
// only returned when the plan has the stock_cost_reports feature; the route says so with a
// 403 FEATURE_NOT_IN_PLAN and the overview marks cost as locked instead.

// Live stock of an item: Nexora-listed items keep it on products / product_variants.
const LIVE_STOCK = "COALESCE(v.stock, p.stock, si.stock)";
const ITEM_JOINS = `FROM stock_items si
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id`;
const ITEM_NAME = "COALESCE(CASE WHEN si.source = 'nexora' THEN p.name END, si.name)";

const num = (v) => Number(v || 0);

const requireCost = (access) => {
    if (!access || !access.features || !access.features.stock_cost_reports) {
        const error = fail("Your plan doesn't include cost and profit reports. Upgrade your plan to see them.", 403);
        error.code = "FEATURE_NOT_IN_PLAN";
        throw error;
    }
};
exports.hasCost = (access) => !!(access && access.features && access.features.stock_cost_reports);

// ------------------------------------------------------------------ on-platform

// Net share of an order line the seller keeps after commission and refunds.
const ON_NET = `COALESCE(oi.seller_net_amount, oi.subtotal - COALESCE(oi.commission_amount, 0))
                * (1 - LEAST(COALESCE(oi.total_refunded, 0), oi.subtotal) / NULLIF(oi.subtotal, 0))`;
const ON_GROSS = "(oi.subtotal - LEAST(COALESCE(oi.total_refunded, 0), oi.subtotal))";
const ON_KEPT = "(1 - LEAST(COALESCE(oi.total_refunded, 0), oi.subtotal) / NULLIF(oi.subtotal, 0))";
const ON_FROM = `FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN stock_items si ON si.link_key = CONCAT(oi.product_id, '-', COALESCE(oi.variant_id, 0))
    WHERE oi.seller_id = ? AND o.status <> 'cancelled' AND oi.wallet_credited = 1 AND oi.chargeback_reversed_at IS NULL
      AND o.created_at >= ? AND o.created_at < ?`;
const onParams = (sellerId, range) => [sellerId, range.start, range.endExclusive];

const onTotals = async (sellerId, range) => {
    const [[row]] = await db.query(
        `SELECT COUNT(DISTINCT oi.order_id) AS orders, COALESCE(SUM(oi.quantity * ${ON_KEPT}), 0) AS units,
                COALESCE(SUM(${ON_GROSS}), 0) AS gross, COALESCE(SUM(${ON_NET}), 0) AS net,
                COALESCE(SUM(oi.quantity * ${ON_KEPT} * si.cost_price), 0) AS cost,
                COALESCE(SUM(CASE WHEN si.cost_price IS NULL THEN oi.quantity * ${ON_KEPT} ELSE 0 END), 0) AS cost_missing_units
         ${ON_FROM}`, onParams(sellerId, range)
    );
    return row;
};

const onDaily = async (sellerId, range) => {
    const [rows] = await db.query(
        `SELECT ${trade.darDaySql("o.created_at")} AS day, SUM(${ON_NET}) AS net
         ${ON_FROM} GROUP BY day`, onParams(sellerId, range)
    );
    return rows;
};

// ----------------------------------------------------------------- off-platform

const OFF_WHERE = "s.seller_id = ? AND s.voided_at IS NULL AND s.sold_at >= ? AND s.sold_at < ?";
const offParams = (sellerId, range) => [sellerId, range.start, range.endExclusive];

const offTotals = async (sellerId, range) => {
    const [[sales]] = await db.query(
        `SELECT COUNT(*) AS sales, COALESCE(SUM(s.total_amount - s.returned_amount), 0) AS revenue,
                COALESCE(SUM(s.discount_amount), 0) AS discounts
         FROM sales s WHERE ${OFF_WHERE}`, offParams(sellerId, range)
    );
    const [[lines]] = await db.query(
        `SELECT COALESCE(SUM(l.quantity - l.returned_quantity), 0) AS units,
                COALESCE(SUM(l.unit_cost * (l.quantity - l.returned_quantity)), 0) AS cost,
                COALESCE(SUM(CASE WHEN l.unit_cost IS NULL THEN l.quantity - l.returned_quantity ELSE 0 END), 0) AS cost_missing_units
         FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE ${OFF_WHERE}`, offParams(sellerId, range)
    );
    return { ...sales, ...lines };
};

const offDaily = async (sellerId, range) => {
    const [rows] = await db.query(
        `SELECT ${trade.darDaySql("s.sold_at", "datetime")} AS day, SUM(s.total_amount - s.returned_amount) AS revenue
         FROM sales s WHERE ${OFF_WHERE} GROUP BY day`, offParams(sellerId, range)
    );
    return rows;
};

const expenseTotals = async (sellerId, range) => {
    const [[row]] = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS amount FROM stock_expenses
         WHERE seller_id = ? AND voided_at IS NULL AND expense_date >= ? AND expense_date <= ?`,
        [sellerId, range.from, range.to]
    );
    return num(row.amount);
};

// ------------------------------------------------------------------- overview

// Revenue split (on / off platform) with a zero-filled daily series. Profit is added only when
// the plan allows cost reports: profit = off-platform revenue + on-platform net - cost - expenses.
exports.overview = async (sellerId, query, access) => {
    const range = trade.resolveRange(query);
    const [on, off, onDay, offDay, expenses] = await Promise.all([
        onTotals(sellerId, range), offTotals(sellerId, range), onDaily(sellerId, range),
        offDaily(sellerId, range), expenseTotals(sellerId, range)
    ]);

    const daily = new Map(range.days.map((d) => [d, { day: d, on_platform: 0, off_platform: 0 }]));
    onDay.forEach((r) => { if (daily.has(r.day)) daily.get(r.day).on_platform = round2(r.net); });
    offDay.forEach((r) => { if (daily.has(r.day)) daily.get(r.day).off_platform = round2(r.revenue); });

    const onPlatform = {
        orders: num(on.orders), units: Math.round(num(on.units)), gross: round2(on.gross),
        commission_and_refunds: round2(num(on.gross) - num(on.net)), net_revenue: round2(on.net)
    };
    const offPlatform = {
        sales: num(off.sales), units: num(off.units), discounts: round2(off.discounts), net_revenue: round2(off.revenue)
    };
    const out = {
        from: range.from, to: range.to, timezone: "Africa/Dar_es_Salaam",
        on_platform: onPlatform, off_platform: offPlatform,
        combined: { net_revenue: round2(onPlatform.net_revenue + offPlatform.net_revenue) },
        expenses: round2(expenses),
        daily: [...daily.values()],
        cost_locked: !exports.hasCost(access), profit: null
    };

    if (exports.hasCost(access)) {
        const cost = round2(num(on.cost) + num(off.cost));
        const revenue = out.combined.net_revenue;
        out.profit = {
            revenue, cost_of_goods: cost, gross_profit: round2(revenue - cost),
            expenses: round2(expenses), net_profit: round2(revenue - cost - expenses),
            on_platform_cost: round2(on.cost), off_platform_cost: round2(off.cost),
            // Items with no cost price recorded count as zero cost, so profit is overstated by
            // however many units this is - the screen says so.
            cost_missing_units: Math.round(num(on.cost_missing_units) + num(off.cost_missing_units))
        };
    }
    return out;
};

// ---------------------------------------------------------------- best sellers

exports.bestSellers = async (sellerId, query, access) => {
    const range = trade.resolveRange(query);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const by = query.by === "revenue" ? "revenue" : "units";
    const withCost = exports.hasCost(access);

    const [off] = await db.query(
        `SELECT l.stock_item_id AS item_id, MAX(l.item_name) AS name,
                SUM(l.quantity - l.returned_quantity) AS units,
                SUM(l.line_total * (l.quantity - l.returned_quantity) / NULLIF(l.quantity, 0)) AS revenue,
                SUM(l.unit_cost * (l.quantity - l.returned_quantity)) AS cost
         FROM sale_lines l JOIN sales s ON s.id = l.sale_id
         WHERE ${OFF_WHERE} GROUP BY l.stock_item_id`, offParams(sellerId, range)
    );
    const [on] = await db.query(
        `SELECT si.id AS item_id, MAX(${ITEM_NAME}) AS name, SUM(oi.quantity * ${ON_KEPT}) AS units,
                SUM(${ON_NET}) AS revenue, SUM(oi.quantity * ${ON_KEPT} * si.cost_price) AS cost
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN stock_items si ON si.link_key = CONCAT(oi.product_id, '-', COALESCE(oi.variant_id, 0))
         LEFT JOIN products p ON p.id = si.product_id
         WHERE oi.seller_id = ? AND o.status <> 'cancelled' AND oi.wallet_credited = 1 AND oi.chargeback_reversed_at IS NULL
           AND o.created_at >= ? AND o.created_at < ? GROUP BY si.id`, onParams(sellerId, range)
    );

    const map = new Map();
    const entry = (id, name) => {
        const key = id === null ? `n:${name}` : id;
        if (!map.has(key)) map.set(key, { item_id: id, name, on_platform_units: 0, on_platform_revenue: 0, off_platform_units: 0, off_platform_revenue: 0, cost: 0 });
        return map.get(key);
    };
    off.forEach((r) => {
        const e = entry(r.item_id, r.name);
        e.off_platform_units += num(r.units); e.off_platform_revenue += num(r.revenue); e.cost += num(r.cost);
    });
    on.forEach((r) => {
        const e = entry(r.item_id, r.name);
        e.on_platform_units += num(r.units); e.on_platform_revenue += num(r.revenue); e.cost += num(r.cost);
    });

    const items = [...map.values()].map((e) => {
        const units = Math.round(e.on_platform_units + e.off_platform_units);
        const revenue = round2(e.on_platform_revenue + e.off_platform_revenue);
        const row = {
            item_id: e.item_id, name: e.name, units, revenue,
            on_platform_units: Math.round(e.on_platform_units), on_platform_revenue: round2(e.on_platform_revenue),
            off_platform_units: Math.round(e.off_platform_units), off_platform_revenue: round2(e.off_platform_revenue)
        };
        if (withCost) { row.cost = round2(e.cost); row.profit = round2(revenue - e.cost); }
        return row;
    }).filter((r) => r.units > 0)
        .sort((a, b) => (b[by] - a[by]) || (b.revenue - a.revenue) || String(a.name).localeCompare(String(b.name)))
        .slice(0, limit);

    return { from: range.from, to: range.to, by, cost_locked: !withCost, items };
};

// ------------------------------------------------------------------ valuation

const VALUATION_SQL = `SELECT si.id, ${ITEM_NAME} AS name, si.unit, si.cost_price, si.sell_price, ${LIVE_STOCK} AS stock
         ${ITEM_JOINS} WHERE si.seller_id = ? AND si.is_archived = 0`;

// Every active item's stock at cost and at selling price. Cost report.
exports.valuationRows = async (sellerId) => {
    const [rows] = await db.query(`${VALUATION_SQL} ORDER BY name ASC, si.id ASC`, [sellerId]);
    return rows.map((r) => {
        const stock = Math.max(0, num(r.stock));
        const cost = r.cost_price === null ? null : num(r.cost_price);
        return {
            id: r.id, name: r.name, unit: r.unit, stock: num(r.stock), cost_price: cost, sell_price: num(r.sell_price),
            value_at_cost: cost === null ? 0 : round2(stock * cost), value_at_retail: round2(stock * num(r.sell_price))
        };
    });
};

exports.valuation = async (sellerId, query, access) => {
    requireCost(access);
    const rows = await exports.valuationRows(sellerId);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 500);
    return {
        items: [...rows].sort((a, b) => b.value_at_cost - a.value_at_cost).slice(0, limit),
        item_count: rows.length,
        total_at_cost: round2(rows.reduce((s, r) => s + r.value_at_cost, 0)),
        total_at_retail: round2(rows.reduce((s, r) => s + r.value_at_retail, 0)),
        items_without_cost: rows.filter((r) => r.cost_price === null && r.stock > 0).length
    };
};

// ------------------------------------------------------------------ low stock

exports.lowStock = async (sellerId, query = {}) => {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 500);
    const [rows] = await db.query(
        `SELECT si.id, ${ITEM_NAME} AS name, si.unit, si.reorder_level, ${LIVE_STOCK} AS stock
         ${ITEM_JOINS}
         WHERE si.seller_id = ? AND si.is_archived = 0 AND si.reorder_level > 0 AND ${LIVE_STOCK} <= si.reorder_level
         ORDER BY (${LIVE_STOCK} <= 0) DESC, (${LIVE_STOCK} - si.reorder_level) ASC, name ASC LIMIT ?`,
        [sellerId, limit]
    );
    const items = rows.map((r) => ({
        id: r.id, name: r.name, unit: r.unit, stock: num(r.stock), reorder_level: num(r.reorder_level),
        status: num(r.stock) <= 0 ? "out" : "low"
    }));
    return { items, out_count: items.filter((i) => i.status === "out").length, low_count: items.filter((i) => i.status === "low").length };
};

// ---------------------------------------------------------------- daily close

// One Dar es Salaam day: sales, money in and out by method, credit given, debts collected,
// supplier payments, expenses. On-platform orders are shown separately - that money arrives in
// the wallet, not the till.
exports.dailyClose = async (sellerId, query = {}) => {
    const day = query.date || trade.today();
    const range = trade.resolveRange({ from: day, to: day });
    const params = [sellerId, range.start, range.endExclusive];

    const [[sales]] = await db.query(
        `SELECT COUNT(*) AS sales, COALESCE(SUM(total_amount - returned_amount), 0) AS net_sales,
                COALESCE(SUM(discount_amount), 0) AS discounts,
                COALESCE(SUM(GREATEST(total_amount - returned_amount - paid_amount, 0)), 0) AS credit_given
         FROM sales s WHERE ${OFF_WHERE}`, params
    );
    const [voided] = await db.query(
        "SELECT COUNT(*) AS n FROM sales WHERE seller_id = ? AND voided_at >= ? AND voided_at < ?", params
    );
    const [money] = await db.query(
        `SELECT direction, kind, method, SUM(amount) AS amount FROM stock_payments
         WHERE seller_id = ? AND paid_at >= ? AND paid_at < ? GROUP BY direction, kind, method`, params
    );
    const [[expenses]] = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS amount FROM stock_expenses
         WHERE seller_id = ? AND voided_at IS NULL AND expense_date = ?`, [sellerId, day]
    );
    const [[purchases]] = await db.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS total FROM purchases
         WHERE seller_id = ? AND purchased_at >= ? AND purchased_at < ?`, params
    );
    const on = await onTotals(sellerId, range);

    const methods = {};
    let moneyIn = 0; let moneyOut = 0; let debtsCollected = 0; let supplierPaid = 0; let refunds = 0;
    money.forEach((r) => {
        const amount = num(r.amount);
        if (!methods[r.method]) methods[r.method] = { in: 0, out: 0 };
        if (r.direction === "in") { methods[r.method].in += amount; moneyIn += amount; if (r.kind === "debt_payment") debtsCollected += amount; }
        else { methods[r.method].out += amount; moneyOut += amount; if (r.kind === "purchase_payment") supplierPaid += amount; else refunds += amount; }
    });
    Object.values(methods).forEach((m) => { m.in = round2(m.in); m.out = round2(m.out); m.net = round2(m.in - m.out); });

    return {
        date: day, timezone: "Africa/Dar_es_Salaam",
        sales: { count: num(sales.sales), net_total: round2(sales.net_sales), discounts: round2(sales.discounts), voided_count: num(voided[0].n) },
        credit_given: round2(sales.credit_given),
        money: {
            in: round2(moneyIn), out: round2(moneyOut), by_method: methods,
            debts_collected: round2(debtsCollected), supplier_payments: round2(supplierPaid), refunds: round2(refunds)
        },
        purchases: { count: num(purchases.n), total: round2(purchases.total) },
        expenses: round2(expenses.amount),
        // What should be in the till and phones after the day's money and expenses. Expenses have
        // no payment method, so they are taken off the total only.
        net_money: round2(moneyIn - moneyOut - num(expenses.amount)),
        on_platform: { orders: num(on.orders), net_revenue: round2(on.net) }
    };
};

// ---------------------------------------------------------------------- debts

const bucketOf = (days) => (days <= 30 ? "0_30" : days <= 60 ? "31_60" : "61_plus");

exports.debts = async (sellerId) => {
    const [customers] = await db.query(
        `SELECT c.id, c.name, c.phone, COUNT(s.id) AS open_sales,
                SUM(GREATEST(s.total_amount - s.returned_amount - s.paid_amount, 0)) AS owed,
                MIN(s.sold_at) AS oldest_at
         FROM stock_customers c JOIN sales s ON s.customer_id = c.id AND s.seller_id = c.seller_id
         WHERE c.seller_id = ? AND s.voided_at IS NULL AND (s.total_amount - s.returned_amount - s.paid_amount) > 0
         GROUP BY c.id, c.name, c.phone ORDER BY owed DESC, c.name ASC LIMIT 500`, [sellerId]
    );
    const [suppliers] = await db.query(
        `SELECT x.id, x.name, x.phone, COUNT(p.id) AS open_purchases,
                SUM(GREATEST(p.total_amount - p.paid_amount, 0)) AS owed, MIN(p.purchased_at) AS oldest_at
         FROM stock_suppliers x JOIN purchases p ON p.supplier_id = x.id AND p.seller_id = x.seller_id
         WHERE x.seller_id = ? AND (p.total_amount - p.paid_amount) > 0
         GROUP BY x.id, x.name, x.phone ORDER BY owed DESC, x.name ASC LIMIT 500`, [sellerId]
    );
    const now = Date.now();
    const shapeRow = (r, openKey) => {
        const days = r.oldest_at ? Math.max(0, Math.floor((now - new Date(r.oldest_at).getTime()) / 86400000)) : 0;
        return { id: r.id, name: r.name, phone: r.phone || null, [openKey]: num(r[openKey]), owed: round2(r.owed), oldest_days: days, age: bucketOf(days) };
    };
    const cust = customers.map((r) => shapeRow(r, "open_sales"));
    const supp = suppliers.map((r) => shapeRow(r, "open_purchases"));
    const ageing = (rows) => rows.reduce((acc, r) => { acc[r.age] = round2(acc[r.age] + r.owed); return acc; }, { "0_30": 0, "31_60": 0, "61_plus": 0 });
    return {
        customers: { items: cust, total_owed: round2(cust.reduce((s, r) => s + r.owed, 0)), ageing: ageing(cust) },
        suppliers: { items: supp, total_owed: round2(supp.reduce((s, r) => s + r.owed, 0)), ageing: ageing(supp) }
    };
};
