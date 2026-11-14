jest.mock("../../../src/modules/settings/settings.repository", () => ({
    findAll: jest.fn(),
    upsert: jest.fn(),
    recordHistory: jest.fn(),
    findHistory: jest.fn(),
    findLastChanges: jest.fn()
}));

const repository = require("../../../src/modules/settings/settings.repository");
const settingsService = require("../../../src/modules/settings/settings.service");

const rows = (overrides = {}) => Object.entries(overrides).map(([setting_key, setting_value]) => ({
    setting_key, setting_value, updated_at: new Date("2026-01-01T00:00:00Z")
}));

describe("holiday theme settings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        repository.findAll.mockResolvedValue(rows());
    });

    it("defaults to off, auto mode and no dates when nothing is saved", async () => {
        const all = await settingsService.getAll();
        expect(all).toMatchObject({
            holiday_theme_enabled: "false",
            holiday_theme_mode: "auto",
            holiday_theme_start_date: "",
            holiday_theme_end_date: ""
        });
    });

    it("saves the switch, mode and dates, recording old -> new history with the actor", async () => {
        await settingsService.updateSettings({
            holiday_theme_enabled: true,
            holiday_theme_mode: "christmas",
            holiday_theme_start_date: "2026-12-01",
            holiday_theme_end_date: "2026-12-31"
        }, { actorId: 9 });
        expect(repository.upsert).toHaveBeenCalledWith("holiday_theme_enabled", "true");
        expect(repository.upsert).toHaveBeenCalledWith("holiday_theme_mode", "christmas");
        expect(repository.upsert).toHaveBeenCalledWith("holiday_theme_start_date", "2026-12-01");
        expect(repository.upsert).toHaveBeenCalledWith("holiday_theme_end_date", "2026-12-31");
        expect(repository.recordHistory).toHaveBeenCalledWith("holiday_theme_enabled", "false", "true", 9);
    });

    it("writes nothing when the values are unchanged", async () => {
        await settingsService.updateSettings({
            holiday_theme_enabled: false, holiday_theme_mode: "auto", holiday_theme_start_date: "", holiday_theme_end_date: ""
        }, { actorId: 1 });
        expect(repository.upsert).not.toHaveBeenCalled();
    });

    it("clears a date when blank or null is sent", async () => {
        repository.findAll.mockResolvedValue(rows({ holiday_theme_start_date: "2026-12-01" }));
        await settingsService.updateSettings({ holiday_theme_start_date: null }, { actorId: 1 });
        expect(repository.upsert).toHaveBeenCalledWith("holiday_theme_start_date", "");
    });

    it("rejects an unknown mode", async () => {
        await expect(settingsService.updateSettings({ holiday_theme_mode: "easter" }, { actorId: 1 })).rejects.toMatchObject({ status: 400 });
        expect(repository.upsert).not.toHaveBeenCalled();
    });

    it("rejects an end date before the start date", async () => {
        await expect(settingsService.updateSettings(
            { holiday_theme_start_date: "2026-12-20", holiday_theme_end_date: "2026-12-10" }, { actorId: 1 }
        )).rejects.toThrow(/before the start date/);
        expect(repository.upsert).not.toHaveBeenCalled();
    });

    it("checks a new end date against the start date already saved", async () => {
        repository.findAll.mockResolvedValue(rows({ holiday_theme_start_date: "2026-12-20" }));
        await expect(settingsService.updateSettings({ holiday_theme_end_date: "2026-12-10" }, { actorId: 1 })).rejects.toThrow(/before the start date/);
    });

    it("accepts a range that crosses the year end", async () => {
        await settingsService.updateSettings({ holiday_theme_start_date: "2026-12-20", holiday_theme_end_date: "2027-01-05" }, { actorId: 1 });
        expect(repository.upsert).toHaveBeenCalledWith("holiday_theme_end_date", "2027-01-05");
    });

    it("rejects dates that don't exist", async () => {
        await expect(settingsService.updateSettings({ holiday_theme_start_date: "2027-02-30" }, { actorId: 1 })).rejects.toThrow(/real dates/);
    });
});
