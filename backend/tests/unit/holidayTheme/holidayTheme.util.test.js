const {
    DEFAULT_TIMEZONE,
    isValidDateString,
    resolveTimezone,
    todayInTimezone,
    seasonForDate,
    resolveHolidayTheme,
    isTruthyFlag
} = require("../../../src/utils/holidayTheme");

const base = { enabled: true, mode: "auto", startDate: "", endDate: "", forcedOff: false };
const on = (today, overrides = {}) => resolveHolidayTheme({ ...base, today, ...overrides });

describe("seasonForDate / auto mode", () => {
    it.each([
        ["2026-11-30", null],
        ["2026-12-01", "christmas"],
        ["2026-12-25", "christmas"],
        ["2026-12-26", "christmas"],
        ["2026-12-27", "newyear"],
        ["2026-12-31", "newyear"],
        ["2027-01-01", "newyear"],
        ["2027-01-03", "newyear"],
        ["2027-01-04", null],
        ["2027-07-15", null]
    ])("%s -> %s", (date, expected) => {
        expect(seasonForDate(date)).toBe(expected);
    });

    it("rolls from the Christmas look to the New Year look and back to off across the year change", () => {
        expect(on("2026-12-26")).toMatchObject({ active: true, mode: "christmas", reason: "season" });
        expect(on("2026-12-27")).toMatchObject({ active: true, mode: "newyear" });
        expect(on("2027-01-03")).toMatchObject({ active: true, mode: "newyear" });
        expect(on("2027-01-04")).toEqual({ active: false, mode: null, reason: "outside_season" });
    });

    it("is off outside the season", () => {
        expect(on("2026-11-14")).toEqual({ active: false, mode: null, reason: "outside_season" });
    });
});

describe("manual modes", () => {
    it("shows the chosen theme whenever the switch is on and no dates are set", () => {
        expect(on("2026-11-14", { mode: "christmas" })).toMatchObject({ active: true, mode: "christmas", reason: "manual" });
        expect(on("2026-06-01", { mode: "newyear" })).toMatchObject({ active: true, mode: "newyear", reason: "manual" });
    });

    it("treats an unknown mode as auto", () => {
        expect(on("2026-12-10", { mode: "easter" })).toMatchObject({ active: true, mode: "christmas", reason: "season" });
        expect(on("2026-06-10", { mode: "easter" })).toMatchObject({ active: false });
    });
});

describe("switch and kill-switch", () => {
    it("is off when the switch is off", () => {
        expect(on("2026-12-25", { enabled: false })).toEqual({ active: false, mode: null, reason: "disabled" });
    });

    it("force-off beats everything", () => {
        expect(on("2026-12-25", { forcedOff: true })).toEqual({ active: false, mode: null, reason: "forced_off" });
        expect(on("2026-12-25", { forcedOff: true, mode: "christmas", enabled: true })).toMatchObject({ active: false });
    });
});

describe("date range", () => {
    it("is inclusive at both ends", () => {
        const range = { startDate: "2026-12-10", endDate: "2026-12-20" };
        expect(on("2026-12-09", range)).toEqual({ active: false, mode: null, reason: "before_window" });
        expect(on("2026-12-10", range)).toMatchObject({ active: true });
        expect(on("2026-12-20", range)).toMatchObject({ active: true });
        expect(on("2026-12-21", range)).toEqual({ active: false, mode: null, reason: "after_window" });
    });

    it("works across the December to January rollover", () => {
        const range = { startDate: "2026-12-20", endDate: "2027-01-05" };
        expect(on("2026-12-31", range)).toMatchObject({ active: true, mode: "newyear" });
        expect(on("2027-01-02", range)).toMatchObject({ active: true, mode: "newyear" });
        // inside the range but past the calendar's New Year season, auto has nothing to show
        expect(on("2027-01-04", range)).toMatchObject({ active: false, reason: "outside_season" });
        expect(on("2027-01-06", range)).toMatchObject({ active: false, reason: "after_window" });
    });

    it("a fixed mode runs for the whole range, even outside the calendar season", () => {
        const range = { startDate: "2027-01-01", endDate: "2027-01-10", mode: "newyear" };
        expect(on("2027-01-08", range)).toMatchObject({ active: true, mode: "newyear", reason: "manual" });
    });

    it("lets Christmas start early when auto has a November start date", () => {
        expect(on("2026-11-25", { startDate: "2026-11-20" })).toMatchObject({ active: true, mode: "christmas" });
        expect(on("2026-11-25")).toMatchObject({ active: false }); // no start date: calendar only
    });

    it("an open-ended side stays open", () => {
        expect(on("2026-12-15", { endDate: "2026-12-31" })).toMatchObject({ active: true });
        expect(on("2026-12-15", { startDate: "2026-12-01" })).toMatchObject({ active: true });
    });

    it("ignores a malformed date instead of crashing", () => {
        expect(on("2026-12-15", { startDate: "soon", endDate: "2026-02-30" })).toMatchObject({ active: true });
    });
});

describe("todayInTimezone", () => {
    it("uses the platform time zone, so New Year starts at midnight in Dar es Salaam", () => {
        const instant = new Date("2026-12-31T21:30:00Z"); // 00:30 on 1 Jan in UTC+3
        expect(todayInTimezone(instant, "Africa/Dar_es_Salaam")).toBe("2027-01-01");
        expect(todayInTimezone(instant, "UTC")).toBe("2026-12-31");
    });

    it("falls back to the default zone for a missing or invalid zone name", () => {
        expect(resolveTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
        expect(resolveTimezone("Not/AZone")).toBe(DEFAULT_TIMEZONE);
        expect(todayInTimezone(new Date("2026-12-31T21:30:00Z"), "Not/AZone")).toBe("2027-01-01");
    });
});

describe("isValidDateString / isTruthyFlag", () => {
    it("accepts only real calendar dates", () => {
        expect(isValidDateString("2026-12-25")).toBe(true);
        expect(isValidDateString("2028-02-29")).toBe(true);
        expect(isValidDateString("2027-02-29")).toBe(false);
        expect(isValidDateString("2026-13-01")).toBe(false);
        expect(isValidDateString("25/12/2026")).toBe(false);
        expect(isValidDateString("")).toBe(false);
        expect(isValidDateString(null)).toBe(false);
    });

    it("reads env-style flags", () => {
        ["true", "TRUE", "1", "yes", "on", " true "].forEach((v) => expect(isTruthyFlag(v)).toBe(true));
        ["false", "0", "", undefined, "off", "no"].forEach((v) => expect(isTruthyFlag(v)).toBe(false));
    });
});
