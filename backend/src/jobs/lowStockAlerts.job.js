// Hourly: tell sellers about items that fell to their reorder level (Phase 8).
// The work lives in modules/stock/stock.alerts.js; see there for the rules.
// Quiet hours: nothing is sent between 21:00 and 07:00 in Dar es Salaam - the next
// run after 07:00 picks the items up, so nobody is woken by a stock alert.
const stockAlerts = require("../modules/stock/stock.alerts");
const logger = require("../utils/logger").child({ module: "job:lowStockAlerts" });
const { DEFAULT_TZ } = require("../utils/dateTz");

const darHour = (now) =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_TZ, hour: "2-digit", hour12: false }).format(now)) % 24;

exports.isQuietHour = (now = new Date()) => {
    const h = darHour(now);
    return h >= 21 || h < 7;
};

exports.run = async (now = new Date()) => {
    if (exports.isQuietHour(now)) return { skipped: "quiet_hours" };
    const result = await stockAlerts.run();
    if (result.sellers) logger.info(result, "low stock alerts sent");
    return result;
};
