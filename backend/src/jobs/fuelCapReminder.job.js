// Monthly reminder to enter the new EWURA fuel cap prices. EWURA caps take
// effect on the first Wednesday of each month, so on that day (Dar es Salaam
// time) every admin gets one notification. Runs daily and is idempotent: the
// month it last reminded is kept in platform_settings, so a repeated tick or
// a second replica never sends twice. Delivery pay keeps using the previous
// cap until a new one is entered (see deliveryRates.service.js).

const adminNotificationService = require("../modules/adminNotification/adminNotification.service");
const settingsRepository = require("../modules/settings/settings.repository");
const logger = require("../utils/logger").child({ module: "job:fuelCapReminder" });

const LAST_REMINDER_KEY = "fuel_cap_reminder_last_month";
const TIME_ZONE = "Africa/Dar_es_Salaam";

// { year, month (1-12), day, weekday (0 = Sunday) } for a Date in Dar es Salaam.
const localParts = (date) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
            .formatToParts(date)
            .map((p) => [p.type, p.value])
    );
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday };
};

exports.isFirstWednesday = (date = new Date()) => {
    const { day, weekday } = localParts(date);
    return weekday === 3 && day <= 7;
};

exports.run = async (now = new Date()) => {
    if (!exports.isFirstWednesday(now)) return false;

    const { year, month } = localParts(now);
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    if ((await settingsRepository.findByKey(LAST_REMINDER_KEY)) === monthKey) return false;

    // Record first: a failed notify is cheaper than a duplicate every tick.
    await settingsRepository.upsert(LAST_REMINDER_KEY, monthKey);

    adminNotificationService.notify({
        type: "fuel_cap_entry_due",
        // admin_notifications.category is a fixed enum; "security" is the
        // existing bucket for system events.
        category: "security",
        severity: "info",
        title: "Enter this month's EWURA fuel caps",
        message: "EWURA's new cap prices take effect today. Enter them under Delivery rates so rider pay follows the new fuel price.",
        metadata: { month: monthKey, page: "/admin/delivery-rates" }
    });

    logger.info({ month: monthKey }, "fuel cap reminder sent");
    return true;
};
