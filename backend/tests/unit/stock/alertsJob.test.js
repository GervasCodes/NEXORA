jest.mock("../../../src/config/db", () => ({ query: jest.fn() }));
jest.mock("../../../src/modules/notification/notification.service", () => ({ notify: jest.fn().mockResolvedValue() }));
jest.mock("../../../src/modules/settings/settings.service", () => ({
    getStockLowAlertChannels: jest.fn().mockResolvedValue(["push"]), getStockExportGraceDays: jest.fn().mockResolvedValue(30)
}));
jest.mock("../../../src/middleware/requireFeature.middleware", () => ({ resolveAccess: jest.fn() }));
jest.mock("../../../src/modules/sms/providers/sms.provider", () => ({ isConfigured: jest.fn().mockReturnValue(true), sendText: jest.fn().mockResolvedValue() }));

const db = require("../../../src/config/db");
const notification = require("../../../src/modules/notification/notification.service");
const settings = require("../../../src/modules/settings/settings.service");
const access = require("../../../src/middleware/requireFeature.middleware");
const sms = require("../../../src/modules/sms/providers/sms.provider");
const alerts = require("../../../src/modules/stock/stock.alerts");
const job = require("../../../src/jobs/lowStockAlerts.job");

const full = { mode: "full", features: { stock_low_alerts: true } };

describe("low-stock alerts", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockReset();
        settings.getStockLowAlertChannels.mockResolvedValue(["push"]);
        access.resolveAccess.mockResolvedValue(full);
    });
    const items = [
        { id: 1, seller_id: 10, name: "Sugar", live_stock: 2 }, { id: 2, seller_id: 10, name: "Oil", live_stock: 0 },
        { id: 3, seller_id: 11, name: "Rice", live_stock: 1 }
    ];
    const script = (rows) => db.query.mockImplementation(async (sql) => (/^\s*SELECT/.test(sql) ? [rows] : [{}]));

    it("sends ONE alert per seller listing their items, and records them so they aren't alerted again", async () => {
        script(items);
        const out = await alerts.run();
        expect(out).toEqual({ sellers: 2, items: 3 });
        expect(notification.notify).toHaveBeenCalledTimes(2);
        const first = notification.notify.mock.calls[0][0];
        expect(first).toMatchObject({ userId: 10, type: "stock_low", titleKey: "notifications.stock.low.title" });
        expect(first.messageParams).toMatchObject({ count: 2, names: "Sugar, Oil" });
        const insert = db.query.mock.calls.find((c) => /INSERT IGNORE INTO stock_low_alert_state/.test(c[0]));
        expect(insert[1][0]).toEqual([[1, 10, 2], [2, 10, 0]]);
    });

    it("only picks items that have not been alerted (no state row) and respect reorder_level > 0", async () => {
        script([]);
        await alerts.run();
        const select = db.query.mock.calls.find((c) => /^\s*SELECT/.test(c[0]))[0];
        expect(select).toMatch(/st\.stock_item_id IS NULL/);
        expect(select).toMatch(/reorder_level > 0/);
        expect(select).toMatch(/is_archived = 0/);
        expect(notification.notify).not.toHaveBeenCalled();
    });

    it("forgets recovered, archived or no-longer-tracked items first, so the next dip alerts again", async () => {
        script([]);
        await alerts.run();
        const del = db.query.mock.calls[0][0];
        expect(del).toMatch(/DELETE st FROM stock_low_alert_state/);
        expect(del).toMatch(/> si\.reorder_level/);
    });

    it("skips sellers whose plan has no low-stock alerts, or is read-only, without recording anything", async () => {
        script(items);
        access.resolveAccess.mockImplementation(async (id) => (id === 10 ? { mode: "read_only", features: { stock_low_alerts: true } } : { mode: "full", features: { stock_low_alerts: false } }));
        const out = await alerts.run();
        expect(out.sellers).toBe(0);
        expect(notification.notify).not.toHaveBeenCalled();
        expect(db.query.mock.calls.some((c) => /INSERT IGNORE/.test(c[0]))).toBe(false);
    });

    it("one seller's failure doesn't stop the others", async () => {
        script(items);
        notification.notify.mockRejectedValueOnce(new Error("push down"));
        const out = await alerts.run();
        expect(out.sellers).toBe(1);
        expect(notification.notify).toHaveBeenCalledTimes(2);
    });

    it("uses WhatsApp and SMS only when the setting says so", async () => {
        script(items.slice(2));
        settings.getStockLowAlertChannels.mockResolvedValue(["push", "whatsapp", "sms"]);
        db.query.mockImplementation(async (sql) => (/FROM users/.test(sql) ? [[{ phone: "+255712000000", language: "sw" }]] : /^\s*SELECT/.test(sql) ? [items.slice(2)] : [{}]));
        await alerts.run();
        expect(notification.notify.mock.calls[0][0].withWhatsApp).toBe(true);
        expect(sms.sendText).toHaveBeenCalledWith("+255712000000", expect.stringContaining("Rice"));
        expect(sms.sendText.mock.calls[0][1]).toMatch(/Bidhaa|zinakaribia/i); // Swahili for a Swahili seller
    });

    it("truncates a long list of names", async () => {
        script(Array.from({ length: 8 }, (v, i) => ({ id: i + 1, seller_id: 10, name: `Item${i + 1}`, live_stock: 0 })));
        await alerts.run();
        expect(notification.notify.mock.calls[0][0].messageParams.names).toBe("Item1, Item2, Item3, Item4, Item5 +3");
    });

    it("tells the seller when an offline sale took an item below zero, and never throws", async () => {
        await alerts.notifyNegativeStock(10, "R000007", ["Sugar"]);
        expect(notification.notify.mock.calls[0][0]).toMatchObject({ type: "stock_negative", messageParams: { receipt: "R000007", names: "Sugar" } });
        notification.notify.mockRejectedValueOnce(new Error("down"));
        await expect(alerts.notifyNegativeStock(10, "R2", ["x"])).resolves.toBeUndefined();
    });
});

describe("lowStockAlerts job", () => {
    it("stays quiet from 21:00 to 07:00 Dar es Salaam", () => {
        expect(job.isQuietHour(new Date("2026-10-27T18:00:00Z"))).toBe(true);  // 21:00
        expect(job.isQuietHour(new Date("2026-10-27T03:59:00Z"))).toBe(true);  // 06:59
        expect(job.isQuietHour(new Date("2026-10-27T04:00:00Z"))).toBe(false); // 07:00
        expect(job.isQuietHour(new Date("2026-10-27T17:59:00Z"))).toBe(false); // 20:59
    });
    it("does nothing during quiet hours", async () => {
        db.query.mockReset();
        expect(await job.run(new Date("2026-10-27T20:00:00Z"))).toEqual({ skipped: "quiet_hours" });
        expect(db.query).not.toHaveBeenCalled();
    });
    it("is scheduled hourly in the job index", () => {
        const src = require("fs").readFileSync(require("path").join(__dirname, "../../../src/jobs/jobs.index.js"), "utf8");
        expect(src).toMatch(/cron\.schedule\("40 \* \* \* \*", safeRun\("lowStockAlerts", lowStockAlertsJob\)\)/);
    });
});
