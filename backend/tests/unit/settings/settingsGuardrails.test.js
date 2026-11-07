jest.mock("../../../src/modules/settings/settings.repository", () => ({
    findAll: jest.fn(),
    upsert: jest.fn(),
    recordHistory: jest.fn(),
    findHistory: jest.fn(),
    findLastChanges: jest.fn()
}));

const repository = require("../../../src/modules/settings/settings.repository");
const settingsService = require("../../../src/modules/settings/settings.service");

const rows = (overrides = {}) => {
    const base = {
        commission_rate: "10",
        commission_rate_max: "30",
        usd_exchange_rate: "2600",
        usd_exchange_rate_max_change_percent: "10",
        escrow_hold_days: "7"
    };
    return Object.entries({ ...base, ...overrides }).map(([setting_key, setting_value]) => ({
        setting_key,
        setting_value,
        updated_at: new Date("2026-01-01T00:00:00Z")
    }));
};

describe("settings guardrails", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        repository.findAll.mockResolvedValue(rows());
    });

    it("refuses a commission above the platform maximum", async () => {
        await expect(
            settingsService.updateSettings({ commission_rate: 45, confirm_commission_change: true }, { actorId: 1 })
        ).rejects.toThrow(/maximum of 30%/);
        expect(repository.upsert).not.toHaveBeenCalled();
    });

    it("asks for confirmation before changing commission", async () => {
        await expect(
            settingsService.updateSettings({ commission_rate: 12 }, { actorId: 1 })
        ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED", field: "commission_rate" });
        expect(repository.upsert).not.toHaveBeenCalled();
    });

    it("saves a confirmed commission change and records old and new values", async () => {
        await settingsService.updateSettings({ commission_rate: 12, confirm_commission_change: true }, { actorId: 7 });
        expect(repository.upsert).toHaveBeenCalledWith("commission_rate", "12");
        expect(repository.recordHistory).toHaveBeenCalledWith("commission_rate", "10", "12", 7);
    });

    it("writes nothing when no value actually changes", async () => {
        await settingsService.updateSettings({ commission_rate: 10, usd_exchange_rate: 2600 }, { actorId: 1 });
        expect(repository.upsert).not.toHaveBeenCalled();
        expect(repository.recordHistory).not.toHaveBeenCalled();
    });

    it("needs a second confirmation when the exchange rate moves beyond the band", async () => {
        await expect(
            settingsService.updateSettings({ usd_exchange_rate: 3200 }, { actorId: 1 })
        ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED", field: "usd_exchange_rate" });

        await settingsService.updateSettings(
            { usd_exchange_rate: 3200, confirm_large_exchange_rate_change: true },
            { actorId: 1 }
        );
        expect(repository.upsert).toHaveBeenCalledWith("usd_exchange_rate", "3200");
    });

    it("lets a small exchange-rate move through without confirmation", async () => {
        await settingsService.updateSettings({ usd_exchange_rate: 2650 }, { actorId: 1 });
        expect(repository.upsert).toHaveBeenCalledWith("usd_exchange_rate", "2650");
    });

    it("keeps escrow hold days within bounds", async () => {
        await expect(settingsService.updateSettings({ escrow_hold_days: 120 }, { actorId: 1 })).rejects.toThrow(/0 to 60/);
        await expect(settingsService.updateSettings({ escrow_hold_days: 2.5 }, { actorId: 1 })).rejects.toThrow(/whole number/);
    });

    it("rejects a save when someone else changed the value after the page loaded", async () => {
        repository.findAll.mockResolvedValue(
            rows().map((r) => (r.setting_key === "escrow_hold_days" ? { ...r, updated_at: new Date("2026-03-01T00:00:00Z") } : r))
        );
        await expect(
            settingsService.updateSettings(
                { escrow_hold_days: 10, expected_updated_at: "2026-02-01T00:00:00Z" },
                { actorId: 1 }
            )
        ).rejects.toMatchObject({ status: 409, code: "STALE_SETTINGS" });
        expect(repository.upsert).not.toHaveBeenCalled();
    });
});
