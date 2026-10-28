const PDFDocument = require("pdfkit");
const db = require("../../config/db");
const salesService = require("./sales.service");
const { DEFAULT_TZ } = require("../../utils/dateTz");

// Nexora Stock Management (Phase 7): the receipt for a POS sale - as data (for the
// on-screen receipt and the WhatsApp / share text) and as a narrow PDF.
//
// This is NOT a fiscal (EFD) receipt. Fiscal receipts exist only for marketplace
// orders (efd module); a till sale gets this plain receipt, and says so on it.
// Amounts always carry the currency. Dates are shown in Africa/Dar_es_Salaam.

const LABELS = {
    en: {
        receipt: "Receipt", no: "Receipt no.", date: "Date", customer: "Customer", item: "Item",
        subtotal: "Subtotal", discount: "Discount", total: "Total", returned: "Returned", paid: "Paid",
        balance: "Balance owed", method: "Payment", thanks: "Thank you for your purchase.",
        notFiscal: "This is not a fiscal (EFD) receipt.", cancelled: "CANCELLED",
        tin: "TIN", tel: "Tel",
        methods: { cash: "Cash", mobile_money: "Mobile money", card: "Card", bank_transfer: "Bank transfer", credit: "On credit", other: "Other" }
    },
    sw: {
        receipt: "Risiti", no: "Namba ya risiti", date: "Tarehe", customer: "Mteja", item: "Bidhaa",
        subtotal: "Jumla ndogo", discount: "Punguzo", total: "Jumla", returned: "Zilizorejeshwa", paid: "Umelipa",
        balance: "Deni lililobaki", method: "Malipo", thanks: "Asante kwa kununua kwetu.",
        notFiscal: "Hii si risiti ya kodi (EFD).", cancelled: "IMEFUTWA",
        tin: "TIN", tel: "Simu",
        methods: { cash: "Fedha taslimu", mobile_money: "Pesa kwa simu", card: "Kadi", bank_transfer: "Benki", credit: "Mkopo", other: "Nyingine" }
    }
};

const labelsFor = (lang) => LABELS[lang === "sw" ? "sw" : "en"];

exports.formatMoney = (amount, currency = "TZS") => {
    const n = Number(amount || 0);
    const text = Number.isInteger(n)
        ? n.toLocaleString("en-US")
        : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency} ${text}`;
};

exports.formatWhen = (value) =>
    new Intl.DateTimeFormat("en-GB", {
        timeZone: DEFAULT_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(value));

const loadBusiness = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT u.first_name, u.last_name, u.business_name, u.business_tin,
                sp.store_name, sp.business_phone, sp.region, sp.city, sp.address, sp.tin
         FROM users u LEFT JOIN seller_profiles sp ON sp.user_id = u.id WHERE u.id = ?`,
        [sellerId]
    );
    const r = rows[0] || {};
    return {
        name: r.store_name || r.business_name || `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Nexora seller",
        phone: r.business_phone || null,
        address: [r.address, r.city, r.region].filter(Boolean).join(", ") || null,
        tin: r.tin || r.business_tin || null
    };
};

exports.buildReceipt = async (sellerId, saleId, lang = "en") => {
    const sale = await salesService.getSale(sellerId, saleId);
    const business = await loadBusiness(sellerId);
    const L = labelsFor(lang);
    const cur = sale.currency;
    const fm = (n) => exports.formatMoney(n, cur);

    const lines = sale.lines.map((l) => ({
        name: l.variant_label ? `${l.item_name} (${l.variant_label})` : l.item_name,
        quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total
    }));

    const text = [];
    text.push(business.name);
    if (business.address) text.push(business.address);
    if (business.phone) text.push(`${L.tel}: ${business.phone}`);
    if (business.tin) text.push(`${L.tin}: ${business.tin}`);
    text.push("", `${L.receipt} ${sale.receipt_no}${sale.status === "voided" ? ` - ${L.cancelled}` : ""}`, exports.formatWhen(sale.sold_at));
    if (sale.customer_name) text.push(`${L.customer}: ${sale.customer_name}`);
    text.push("");
    lines.forEach((l) => text.push(`${l.name}  ${l.quantity} x ${fm(l.unit_price)} = ${fm(l.line_total)}`));
    text.push("");
    if (sale.discount_amount > 0) text.push(`${L.discount}: -${fm(sale.discount_amount)}`);
    if (sale.returned_amount > 0) text.push(`${L.returned}: -${fm(sale.returned_amount)}`);
    text.push(`${L.total}: ${fm(sale.net_amount)}`);
    text.push(`${L.paid}: ${fm(sale.paid_amount)} (${L.methods[sale.payment_method] || sale.payment_method})`);
    if (sale.balance > 0) text.push(`${L.balance}: ${fm(sale.balance)}`);
    text.push("", L.thanks);

    return { business, sale: { ...sale, lines }, currency: cur, lang: lang === "sw" ? "sw" : "en", share_text: text.join("\n") };
};

// Narrow (80 mm) PDF, streamed straight to the response like the order invoice.
exports.streamPdf = async (res, sellerId, saleId, lang = "en") => {
    const r = await exports.buildReceipt(sellerId, saleId, lang);
    const L = labelsFor(r.lang);
    const { sale, business } = r;
    const fm = (n) => exports.formatMoney(n, sale.currency);

    const WIDTH = 226;
    const M = 12;
    const inner = WIDTH - M * 2;
    const rowsEstimate = sale.lines.reduce((s, l) => s + 22 + Math.floor(l.name.length / 34) * 10, 0);
    const height = Math.max(300, 230 + rowsEstimate + (sale.balance > 0 ? 14 : 0) + (sale.returned_amount > 0 ? 12 : 0) + (sale.discount_amount > 0 ? 12 : 0));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="receipt-${sale.receipt_no}.pdf"`);

    const doc = new PDFDocument({ size: [WIDTH, height], margin: M });
    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(11).text(business.name, { align: "center", width: inner });
    doc.font("Helvetica").fontSize(7.5).fillColor("#444444");
    if (business.address) doc.text(business.address, { align: "center", width: inner });
    if (business.phone) doc.text(`${L.tel}: ${business.phone}`, { align: "center", width: inner });
    if (business.tin) doc.text(`${L.tin}: ${business.tin}`, { align: "center", width: inner });
    doc.moveDown(0.6).fillColor("#000000").font("Helvetica-Bold").fontSize(9)
        .text(`${L.receipt} ${sale.receipt_no}`, { align: "center", width: inner });
    if (sale.status === "voided") doc.fillColor("#B00020").text(L.cancelled, { align: "center", width: inner }).fillColor("#000000");
    doc.font("Helvetica").fontSize(7.5).text(exports.formatWhen(sale.sold_at), { align: "center", width: inner });
    if (sale.customer_name) doc.text(`${L.customer}: ${sale.customer_name}`, { align: "center", width: inner });
    doc.moveDown(0.5);
    doc.moveTo(M, doc.y).lineTo(WIDTH - M, doc.y).strokeColor("#999999").lineWidth(0.5).stroke();
    doc.moveDown(0.4);

    sale.lines.forEach((l) => {
        doc.font("Helvetica").fontSize(8).fillColor("#000000").text(l.name, { width: inner });
        const y = doc.y;
        doc.fontSize(7.5).fillColor("#444444").text(`${l.quantity} x ${fm(l.unit_price)}`, M, y, { width: inner / 2 });
        doc.fillColor("#000000").text(fm(l.line_total), M + inner / 2, y, { width: inner / 2, align: "right" });
        doc.moveDown(0.3);
    });

    doc.moveTo(M, doc.y).lineTo(WIDTH - M, doc.y).strokeColor("#999999").stroke();
    doc.moveDown(0.4);

    const row = (label, value, bold) => {
        const y = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 9 : 8).fillColor("#000000");
        doc.text(label, M, y, { width: inner / 2 });
        doc.text(value, M + inner / 2, y, { width: inner / 2, align: "right" });
    };
    if (sale.discount_amount > 0) row(L.discount, `-${fm(sale.discount_amount)}`);
    if (sale.returned_amount > 0) row(L.returned, `-${fm(sale.returned_amount)}`);
    row(L.total, fm(sale.net_amount), true);
    row(`${L.paid} (${L.methods[sale.payment_method] || sale.payment_method})`, fm(sale.paid_amount));
    if (sale.balance > 0) row(L.balance, fm(sale.balance), true);

    doc.moveDown(1).font("Helvetica").fontSize(7.5).fillColor("#444444")
        .text(L.thanks, M, doc.y, { align: "center", width: inner })
        .text(L.notFiscal, M, doc.y, { align: "center", width: inner });
    doc.end();
};
