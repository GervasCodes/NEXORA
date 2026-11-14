import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../../../src/context/LanguageContext";

let mockHoliday = {};
vi.mock("../../../src/context/HolidayContext", () => ({
    useHoliday: () => mockHoliday
}));

import HolidayMount from "../../../src/components/HolidayMount";
import HolidayToggle from "../../../src/components/HolidayToggle";
import {
    MAX_SNOWFLAKES, MAX_SNOWFLAKES_SMALL, MAX_BURST_PARTICLES, SPARKLE_COUNT,
    snowCountFor, createBurst, createSparkles
} from "../../../src/components/holiday/particles";

describe("HolidayMount", () => {
    it("renders nothing, and never loads the layer, when not visible", () => {
        mockHoliday = { visible: false, mode: "christmas" };
        const { container } = render(<HolidayMount />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders a pointer-events-none canvas when visible", async () => {
        mockHoliday = { visible: true, mode: "christmas" };
        const { container } = render(<HolidayMount />);
        await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
        const canvas = container.querySelector("canvas");
        expect(canvas).toHaveClass("pointer-events-none");
        expect(canvas).toHaveAttribute("aria-hidden", "true");
        expect(canvas).toHaveAttribute("data-holiday-layer", "christmas");
    });
});

describe("HolidayLayer animation loop", () => {
    let rafSpy;
    let cafSpy;
    beforeEach(() => {
        const ctx = new Proxy({}, { get: () => vi.fn(), set: () => true });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
        rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 7);
        cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
    });

    const setHidden = (hidden) => {
        Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
        document.dispatchEvent(new Event("visibilitychange"));
    };

    it("pauses when the tab is hidden, resumes when it is shown, and stops on unmount", async () => {
        mockHoliday = { visible: true, mode: "christmas" };
        const { unmount, container } = render(<HolidayMount />);
        await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
        await waitFor(() => expect(rafSpy).toHaveBeenCalled());

        const before = rafSpy.mock.calls.length;
        setHidden(true);
        expect(cafSpy).toHaveBeenCalled();

        setHidden(false);
        expect(rafSpy.mock.calls.length).toBeGreaterThan(before);

        cafSpy.mockClear();
        unmount();
        expect(cafSpy).toHaveBeenCalled();
    });

    it("does not start at all when the tab is already hidden", async () => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        mockHoliday = { visible: true, mode: "newyear" };
        const { container } = render(<HolidayMount />);
        await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
        expect(rafSpy).not.toHaveBeenCalled();
    });
});

describe("particle caps", () => {
    it("caps snow, smaller on phones", () => {
        expect(snowCountFor(1920, 1080)).toBeLessThanOrEqual(MAX_SNOWFLAKES);
        expect(snowCountFor(360, 800)).toBeLessThanOrEqual(MAX_SNOWFLAKES_SMALL);
    });
    it("a burst never exceeds the room left under the cap", () => {
        expect(createBurst(1000, 800, 5)).toHaveLength(5);
        expect(createBurst(1000, 800, 0)).toHaveLength(0);
        expect(createBurst(1000, 800, MAX_BURST_PARTICLES).length).toBeLessThanOrEqual(MAX_BURST_PARTICLES);
    });
    it("sparkles are capped", () => {
        expect(createSparkles(1000, 800)).toHaveLength(SPARKLE_COUNT);
    });
});

describe("HolidayToggle", () => {
    const renderToggle = (props) =>
        render(<LanguageProvider><HolidayToggle {...props} /></LanguageProvider>);

    it("is hidden when the theme is not live on the server", () => {
        mockHoliday = { active: false, suppressed: false, visible: false, mode: null, toggle: vi.fn() };
        const { container } = renderToggle();
        expect(container).toBeEmptyDOMElement();
    });

    it("is hidden under reduced motion / data saver (a switch would do nothing)", () => {
        mockHoliday = { active: true, suppressed: true, visible: false, mode: "christmas", toggle: vi.fn() };
        const { container } = renderToggle();
        expect(container).toBeEmptyDOMElement();
    });

    it("offers to turn decorations off when on, and on when off", () => {
        mockHoliday = { active: true, suppressed: false, visible: true, mode: "christmas", toggle: vi.fn() };
        const { unmount } = renderToggle();
        expect(screen.getByRole("button", { name: "Turn off festive decorations" })).toBeInTheDocument();
        unmount();

        mockHoliday = { active: true, suppressed: false, visible: false, mode: "christmas", toggle: vi.fn() };
        renderToggle();
        expect(screen.getByRole("button", { name: "Turn on festive decorations" })).toBeInTheDocument();
    });
});
