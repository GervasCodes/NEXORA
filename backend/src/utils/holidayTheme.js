"use strict";

// Pure date/mode logic for the holiday theme (Christmas + New Year), kept free
// of the database and of "now" so it can be tested for any date, including the
// December -> January rollover. The settings that feed it live in
// platform_settings (holiday_theme_*), see settings.service.js.
//
// Modes
//   "christmas" / "newyear"  a manual choice: shows that theme whenever the
//                            switch is on (and inside the date range, if one is set).
//   "auto"                   follows the calendar:
//                              Dec 1  - Dec 26  -> christmas
//                              Dec 27 - Jan 3   -> newyear
//                            and is off the rest of the year. If a start date
//                            is set in November, Christmas may begin early.
//
// Date range (optional, inclusive, YYYY-MM-DD): the theme is only active between
// start_date and end_date. A blank side is open-ended.
//
// "Today" is evaluated in the platform's time zone, not the server's, so New
// Year changes over at midnight in Tanzania even when the server runs on UTC.

const DEFAULT_TIMEZONE = "Africa/Dar_es_Salaam";
const HOLIDAY_MODES = ["auto", "christmas", "newyear"];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidDateString = (value) => {
    if (typeof value !== "string") return false;
    const match = DATE_PATTERN.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// Falls back to the default for a missing or unrecognised zone name.
const resolveTimezone = (timezone) => {
    if (!timezone) return DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return timezone;
    } catch {
        return DEFAULT_TIMEZONE;
    }
};

// "YYYY-MM-DD" for the given instant in the given zone.
const todayInTimezone = (now = new Date(), timezone) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: resolveTimezone(timezone),
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);
    const pick = (type) => parts.find((p) => p.type === type).value;
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
};

// The calendar's own season for a date, or null outside it.
const seasonForDate = (dateString) => {
    const [, month, day] = dateString.split("-").map(Number);
    if (month === 12) return day <= 26 ? "christmas" : "newyear";
    if (month === 1 && day <= 3) return "newyear";
    return null;
};

const monthOf = (dateString) => Number(dateString.split("-")[1]);

// -> { active, mode, reason }. `mode` is null when inactive. `reason` explains
// the outcome (shown to admins): forced_off | disabled | before_window |
// after_window | outside_season | manual | season.
const resolveHolidayTheme = ({ enabled, mode, startDate, endDate, forcedOff = false, today }) => {
    const inactive = (reason) => ({ active: false, mode: null, reason });

    if (forcedOff) return inactive("forced_off");
    if (!enabled) return inactive("disabled");

    const start = isValidDateString(startDate) ? startDate : "";
    const end = isValidDateString(endDate) ? endDate : "";
    if (start && today < start) return inactive("before_window");
    if (end && today > end) return inactive("after_window");

    const chosen = HOLIDAY_MODES.includes(mode) ? mode : "auto";
    if (chosen !== "auto") return { active: true, mode: chosen, reason: "manual" };

    const season = seasonForDate(today);
    if (season) return { active: true, mode: season, reason: "season" };

    // An admin-set start date in November lets Christmas begin early.
    if (start && monthOf(today) === 11) return { active: true, mode: "christmas", reason: "season" };

    return inactive("outside_season");
};

const isTruthyFlag = (value) => ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

module.exports = {
    DEFAULT_TIMEZONE,
    HOLIDAY_MODES,
    isValidDateString,
    resolveTimezone,
    todayInTimezone,
    seasonForDate,
    resolveHolidayTheme,
    isTruthyFlag
};
