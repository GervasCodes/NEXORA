const settingsService = require("../settings/settings.service");
const {
    resolveHolidayTheme,
    resolveTimezone,
    todayInTimezone,
    isTruthyFlag
} = require("../../utils/holidayTheme");

// Full status, for the admin Settings page: whether the theme is on today, which
// mode, and why. HOLIDAY_THEME_FORCE_OFF=true wins over everything the admin
// has saved (kill-switch). settingsService.getAll() is already cached briefly
// and invalidated whenever an admin saves.
exports.getStatus = async ({ now = new Date() } = {}) => {
    const settings = await settingsService.getAll();
    const timezone = resolveTimezone(process.env.HOLIDAY_THEME_TIMEZONE);
    const today = todayInTimezone(now, timezone);
    const forcedOff = isTruthyFlag(process.env.HOLIDAY_THEME_FORCE_OFF);

    const result = resolveHolidayTheme({
        enabled: settings.holiday_theme_enabled === true || settings.holiday_theme_enabled === "true",
        mode: settings.holiday_theme_mode,
        startDate: settings.holiday_theme_start_date,
        endDate: settings.holiday_theme_end_date,
        forcedOff,
        today
    });

    return { ...result, forcedOff, today, timezone };
};

// What visitors get: only whether the theme is active and which one. No dates,
// no reasons, no admin detail.
exports.getPublicStatus = async (options) => {
    const status = await exports.getStatus(options);
    return { active: status.active, mode: status.active ? status.mode : null };
};
