jest.mock("../../../src/config/db", () => ({ query: jest.fn() }));
jest.mock("../../../src/modules/stock/sales.service", () => ({ getSale: jest.fn() }));

const { Writable } = require("stream");
const db = require("../../../src/config/db");
const salesService = require("../../../src/modules/stock/sales.service");
const receipt = require("../../../src/modules/stock/receipt.service");

const sale = (over = {}) => ({
    id: 1, receipt_no: "R000007", status: "active", currency: "TZS", customer_name: "Asha", sold_at: new Date("2026-10-27T11:30:00Z"),
    discount_amount: 500, returned_amount: 0, net_amount: 7200, paid_amount: 5000, balance: 2200, payment_method: "credit",
    lines: [
        { item_name: "Kitenge", variant_label: "Red", quantity: 2, unit_price: 2500, line_total: 5000 },
        { item_name: "Khanga", variant_label: null, quantity: 3, unit_price: 900.5, line_total: 2701.5 }
    ],
    ...over
});

describe("receipt.service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockResolvedValue([[{ store_name: "Mama Asha Store", business_phone: "0712000000", region: "Dar es Salaam", city: "Ilala", address: "Kariakoo", tin: "123-456-789" }]]);
        salesService.getSale.mockResolvedValue(sale());
    });

    it("always shows the currency and trims whole numbers", () => {
        expect(receipt.formatMoney(12500)).toBe("TZS 12,500");
        expect(receipt.formatMoney(900.5)).toBe("TZS 900.50");
        expect(receipt.formatMoney(0)).toBe("TZS 0");
    });

    it("shows the time in Dar es Salaam, not UTC", () => {
        expect(receipt.formatWhen("2026-10-27T21:30:00Z")).toBe("28/10/2026, 00:30");
    });

    it("builds share text in English with the business header, lines, balance and no fiscal claim", async () => {
        const r = await receipt.buildReceipt(1, 1, "en");
        expect(r.share_text).toContain("Mama Asha Store");
        expect(r.share_text).toContain("TIN: 123-456-789");
        expect(r.share_text).toContain("Receipt R000007");
        expect(r.share_text).toContain("Kitenge (Red)  2 x TZS 2,500 = TZS 5,000");
        expect(r.share_text).toContain("Discount: -TZS 500");
        expect(r.share_text).toContain("Balance owed: TZS 2,200");
        expect(r.share_text).toContain("(On credit)");
    });

    it("builds it in Swahili when asked, and falls back to English for an unknown language", async () => {
        expect((await receipt.buildReceipt(1, 1, "sw")).share_text).toContain("Deni lililobaki: TZS 2,200");
        expect((await receipt.buildReceipt(1, 1, "fr")).lang).toBe("en");
    });

    it("marks a cancelled sale and leaves the balance line out when nothing is owed", async () => {
        salesService.getSale.mockResolvedValue(sale({ status: "voided", balance: 0 }));
        const r = await receipt.buildReceipt(1, 1, "en");
        expect(r.share_text).toContain("CANCELLED");
        expect(r.share_text).not.toContain("Balance owed");
    });

    it("falls back to the account name for a business-tools account with no store profile", async () => {
        db.query.mockResolvedValue([[{ first_name: "Juma", last_name: "Bakari", business_name: null, store_name: null }]]);
        expect((await receipt.buildReceipt(1, 1)).business.name).toBe("Juma Bakari");
    });

    it("streams a real PDF with download headers", async () => {
        const chunks = [];
        const res = new Writable({ write(chunk, enc, cb) { chunks.push(chunk); cb(); } });
        const headers = {};
        res.setHeader = (k, v) => { headers[k] = v; };
        const done = new Promise((resolve) => res.on("finish", resolve));
        await receipt.streamPdf(res, 1, 1, "sw");
        await done;
        const pdf = Buffer.concat(chunks);
        expect(pdf.slice(0, 5).toString()).toBe("%PDF-");
        expect(pdf.length).toBeGreaterThan(800);
        expect(headers["Content-Type"]).toBe("application/pdf");
        expect(headers["Content-Disposition"]).toContain("receipt-R000007.pdf");
    });
});
