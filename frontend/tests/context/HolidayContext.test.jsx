import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiGet = vi.fn();
vi.mock("../../src/api/client", () => ({ default: { get: (...a) => apiGet(...a) } }));

let mockDataSaver = false;
vi.mock("../../src/context/DataSaverContext", () => ({
    useDataSaver: () => ({ enabled: mockDataSaver })
}));

import { HolidayProvider, useHoliday, seasonYear, seasonKey } from "../../src/context/HolidayContext";

const KEY = "nexora_holiday_dismissed";

function Probe() {
    const h = useHoliday();
    return (
        <div>
            <span data-testid="state">
                {JSON.stringify({ active: h.active, mode: h.mode, visible: h.visible, dismissed: h.dismissed, suppressed: h.suppressed })}
            </span>
            <button type="button" onClick={h.toggle}>toggle</button>
        </div>
    );
}

const state = () => JSON.parse(screen.getByTestId("state").textContent);

const mountWith = async (serverData) => {
    if (serverData instanceof Error) apiGet.mockRejectedValue(serverData);
    else apiGet.mockResolvedValue({ data: { data: serverData } });
    render(
        <HolidayProvider>
            <Probe />
        </HolidayProvider>
    );
    // The provider waits for browser idle (or a 1.2 s timer) before asking.
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/holiday-theme"), { timeout: 4000 });
    await act(async () => {});
};

const setReducedMotion = (matches) => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query.includes("prefers-reduced-motion") ? matches : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    }));
};

describe("HolidayContext", () => {
    beforeEach(() => {
        localStorage.clear();
        apiGet.mockReset();
        mockDataSaver = false;
        setReducedMotion(false);
        // Run the "browser is idle" callback straight away so tests are fast.
        window.requestIdleCallback = (fn) => setTimeout(fn, 0);
        window.cancelIdleCallback = (id) => clearTimeout(id);
    });
    afterEach(() => vi.restoreAllMocks());

    it("is off until the server says otherwise (nothing is requested before idle)", () => {
        apiGet.mockResolvedValue({ data: { data: { active: true, mode: "christmas" } } });
        render(<HolidayProvider><Probe /></HolidayProvider>);
        expect(state()).toMatchObject({ active: false, visible: false });
    });

    it("is visible when the server reports an active mode", async () => {
        await mountWith({ active: true, mode: "christmas" });
        expect(state()).toMatchObject({ active: true, mode: "christmas", visible: true, dismissed: false });
    });

    it("supports New Year mode", async () => {
        await mountWith({ active: true, mode: "newyear" });
        expect(state()).toMatchObject({ active: true, mode: "newyear", visible: true });
    });

    it("stays off when the server says off (admin switch off or HOLIDAY_THEME_FORCE_OFF)", async () => {
        await mountWith({ active: false, mode: null });
        expect(state()).toMatchObject({ active: false, visible: false });
    });

    it("ignores an unknown mode from the server", async () => {
        await mountWith({ active: true, mode: "halloween" });
        expect(state()).toMatchObject({ active: false, visible: false });
    });

    it("stays off when the request fails", async () => {
        await mountWith(new Error("network"));
        expect(state()).toMatchObject({ active: false, visible: false });
    });

    it("is suppressed (not visible) when the device prefers reduced motion", async () => {
        setReducedMotion(true);
        await mountWith({ active: true, mode: "christmas" });
        expect(state()).toMatchObject({ active: true, suppressed: true, visible: false });
    });

    it("is suppressed (not visible) when Data Saver is on", async () => {
        mockDataSaver = true;
        await mountWith({ active: true, mode: "christmas" });
        expect(state()).toMatchObject({ active: true, suppressed: true, visible: false });
    });

    it("the visitor can turn it off, it is remembered, and it can be turned back on", async () => {
        const user = userEvent.setup();
        await mountWith({ active: true, mode: "christmas" });

        await user.click(screen.getByRole("button", { name: "toggle" }));
        expect(state()).toMatchObject({ visible: false, dismissed: true });
        expect(localStorage.getItem(KEY)).toBe(seasonKey("christmas"));

        await user.click(screen.getByRole("button", { name: "toggle" }));
        expect(state()).toMatchObject({ visible: true, dismissed: false });
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("a remembered dismissal hides it on the next visit", async () => {
        localStorage.setItem(KEY, seasonKey("christmas"));
        await mountWith({ active: true, mode: "christmas" });
        expect(state()).toMatchObject({ active: true, visible: false, dismissed: true });
    });

    it("dismissing Christmas does not hide New Year", async () => {
        localStorage.setItem(KEY, seasonKey("christmas"));
        await mountWith({ active: true, mode: "newyear" });
        expect(state()).toMatchObject({ visible: true, dismissed: false });
    });

    it("still works when localStorage is unavailable", async () => {
        const user = userEvent.setup();
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
        await mountWith({ active: true, mode: "christmas" });
        await user.click(screen.getByRole("button", { name: "toggle" }));
        expect(state()).toMatchObject({ visible: false, dismissed: true });
    });
});

describe("season helpers", () => {
    it("New Year greeting looks forward in December and stays in January", () => {
        expect(seasonYear("newyear", new Date(2026, 11, 28))).toBe(2027);
        expect(seasonYear("newyear", new Date(2027, 0, 2))).toBe(2027);
        expect(seasonYear("christmas", new Date(2026, 11, 25))).toBe(2026);
        expect(seasonKey("newyear", new Date(2026, 11, 31))).toBe("newyear:2027");
    });
});
