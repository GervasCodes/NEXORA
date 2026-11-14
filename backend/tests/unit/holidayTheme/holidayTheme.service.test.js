jest.mock("../../../src/modules/settings/settings.service", () => ({ getAll: jest.fn() }));

const settingsService = require("../../../src/modules/settings/settings.service");
const holidayThemeService = require("../../../src/modules/holidayTheme/holidayTheme.service");

const christmasDay = new Date("2026-12-25T09:00:00Z");

describe("holidayTheme.service", () => {
    const saved = { ...process.env };
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.HOLIDAY_THEME_FORCE_OFF;
        delete process.env.HOLIDAY_THEME_TIMEZONE;
        settingsService.getAll.mockResolvedValue({
            holiday_theme_enabled: "true",
            holiday_theme_mode: "auto",
            holiday_theme_start_date: "",
            holiday_theme_end_date: ""
        });
    });
    afterAll(() => { process.env = saved; });

    it("reports christmas on 25 December when switched on", async () => {
        await expect(holidayThemeService.getStatus({ now: christmasDay })).resolves.toMatchObject({
            active: true, mode: "christmas", reason: "season", forcedOff: false, today: "2026-12-25", timezone: "Africa/Dar_es_Salaam"
        });
    });

    it("is off when the admin switch is off", async () => {
        settingsService.getAll.mockResolvedValue({ holiday_theme_enabled: "false", holiday_theme_mode: "auto" });
        await expect(holidayThemeService.getStatus({ now: christmasDay })).resolves.toMatchObject({ active: false, reason: "disabled" });
    });

    it("HOLIDAY_THEME_FORCE_OFF=true wins over the admin switch", async () => {
        process.env.HOLIDAY_THEME_FORCE_OFF = "true";
        await expect(holidayThemeService.getStatus({ now: christmasDay })).resolves.toMatchObject({
            active: false, reason: "forced_off", forcedOff: true
        });
        await expect(holidayThemeService.getPublicStatus({ now: christmasDay })).resolves.toEqual({ active: false, mode: null });
    });

    it("decides 'today' in the platform time zone, not UTC", async () => {
        // 22:00 UTC on 26 Dec is already 27 Dec (New Year season) in Dar es Salaam
        const status = await holidayThemeService.getStatus({ now: new Date("2026-12-26T22:00:00Z") });
        expect(status).toMatchObject({ active: true, mode: "newyear", today: "2026-12-27" });
    });

    it("honours HOLIDAY_THEME_TIMEZONE", async () => {
        process.env.HOLIDAY_THEME_TIMEZONE = "UTC";
        const status = await holidayThemeService.getStatus({ now: new Date("2026-12-26T22:00:00Z") });
        expect(status).toMatchObject({ mode: "christmas", today: "2026-12-26", timezone: "UTC" });
    });

    it("public status exposes only { active, mode }", async () => {
        settingsService.getAll.mockResolvedValue({
            holiday_theme_enabled: "true",
            holiday_theme_mode: "auto",
            holiday_theme_start_date: "2026-12-01",
            holiday_theme_end_date: "2027-01-03"
        });
        const pub = await holidayThemeService.getPublicStatus({ now: christmasDay });
        expect(pub).toEqual({ active: true, mode: "christmas" });
        expect(Object.keys(pub).sort()).toEqual(["active", "mode"]);
    });

    it("public status has a null mode when inactive", async () => {
        await expect(holidayThemeService.getPublicStatus({ now: new Date("2026-06-01T09:00:00Z") })).resolves.toEqual({ active: false, mode: null });
    });
});
