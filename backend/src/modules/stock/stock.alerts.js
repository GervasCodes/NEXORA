const db = require("../../config/db");
const logger = require("../../utils/logger").child({ module: "stock-alerts" });
const settingsService = require("../settings/settings.service");
const requireFeature = require("../../middleware/requireFeature.middleware");
const { t, resolveLocale } = require("../../i18n");

// Low-stock and negative-stock alerts (Phase 8). They go out through the modules that
// already exist: notification.service.notify (in-app + socket + web push, and WhatsApp
// when the seller opted in) and the SMS provider. Channels come from the setting
// stock_low_alert_channels. Nothing here may break a sale or a job run: every send is
// best-effort and logged.

const NAMES_SHOWN = 5;
const LOW_URL = "/seller/stock/items?filter=low";

const nameList = (names) => {
    const shown = names.slice(0, NAMES_SHOWN).join(", ");
    return names.length > NAMES_SHOWN ? `${shown} +${names.length - NAMES_SHOWN}` : shown;
};

const sendSms = async (userId, text) => {
    const smsProvider = require("../sms/providers/sms.provider");
    if (!smsProvider.isConfigured()) return;
    const [rows] = await db.query("SELECT phone FROM users WHERE id = ?", [userId]);
    if (!rows[0] || !rows[0].phone) return;
    await smsProvider.sendText(rows[0].phone, text);
};

const dispatch = async ({ userId, type, titleKey, messageKey, params, url }) => {
    const notificationService = require("../notification/notification.service");
    const channels = await settingsService.getStockLowAlertChannels();
    await notificationService.notify({
        userId, type, titleKey, messageKey, titleParams: params, messageParams: params, url,
        withWhatsApp: channels.includes("whatsapp")
    });
    if (channels.includes("sms")) {
        const [rows] = await db.query("SELECT language FROM users WHERE id = ?", [userId]);
        const locale = resolveLocale(rows[0] && rows[0].language);
        await sendSms(userId, `${t(locale, titleKey, params)}. ${t(locale, messageKey, params)}`);
    }
};

// A synced offline sale took stock below zero. Tell the seller once per sale.
exports.notifyNegativeStock = async (sellerId, receiptNo, names) => {
    try {
        await dispatch({
            userId: sellerId, type: "stock_negative",
            titleKey: "notifications.stock.negative.title", messageKey: "notifications.stock.negative.message",
            params: { receipt: receiptNo, names: nameList(names) }, url: LOW_URL
        });
    } catch (err) {
        logger.warn({ err: err.message, sellerId }, "negative stock alert failed");
    }
};

// What the live stock of an item is: Nexora-listed items keep it on products /
// product_variants, everything else on stock_items (see migration 157).
const LIVE_STOCK = "COALESCE(v.stock, p.stock, si.stock)";

// One pass of the hourly job. Finds items at or below their reorder level that have not
// been alerted yet, sends ONE alert per seller (up to NAMES_SHOWN names), records them,
// and forgets items that have recovered so the next dip alerts again.
exports.run = async () => {
    // Recovered items first, so an item that dipped, recovered and dipped again is alerted again.
    await db.query(
        `DELETE st FROM stock_low_alert_state st
         JOIN stock_items si ON si.id = st.stock_item_id
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE si.is_archived = 1 OR si.reorder_level <= 0 OR ${LIVE_STOCK} > si.reorder_level`
    );

    const [rows] = await db.query(
        `SELECT si.id, si.seller_id, si.name, ${LIVE_STOCK} AS live_stock
         FROM stock_items si
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         LEFT JOIN stock_low_alert_state st ON st.stock_item_id = si.id
         WHERE si.is_archived = 0 AND si.reorder_level > 0 AND st.stock_item_id IS NULL
           AND ${LIVE_STOCK} <= si.reorder_level
         ORDER BY si.seller_id, si.name LIMIT 5000`
    );

    const bySeller = new Map();
    rows.forEach((r) => {
        if (!bySeller.has(r.seller_id)) bySeller.set(r.seller_id, []);
        bySeller.get(r.seller_id).push(r);
    });

    let alerted = 0;
    for (const [sellerId, items] of bySeller) {
        try {
            const access = await requireFeature.resolveAccess(sellerId);
            if (access.mode !== "full" || !access.features.stock_low_alerts) continue;

            await dispatch({
                userId: sellerId, type: "stock_low",
                titleKey: "notifications.stock.low.title", messageKey: "notifications.stock.low.message",
                params: { count: items.length, names: nameList(items.map((i) => i.name)) }, url: LOW_URL
            });
            await db.query(
                "INSERT IGNORE INTO stock_low_alert_state (stock_item_id, seller_id, stock_at_alert) VALUES ?",
                [items.map((i) => [i.id, sellerId, Number(i.live_stock)])]
            );
            alerted += 1;
        } catch (err) {
            logger.warn({ err: err.message, sellerId }, "low stock alert failed");
        }
    }
    return { sellers: alerted, items: rows.length };
};
