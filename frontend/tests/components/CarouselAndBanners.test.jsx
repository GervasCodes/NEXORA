import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(() => Promise.reject(new Error("offline"))) }
}));

import HomeCarousel from "../../src/components/HomeCarousel";
import FloatingActions, { FLOAT_DELAY_MS } from "../../src/components/FloatingActions";
import { LanguageProvider } from "../../src/context/LanguageContext";
import { CurrencyProvider } from "../../src/context/CurrencyContext";
import { DataSaverProvider } from "../../src/context/DataSaverContext";

describe("HomeCarousel controls", () => {
    it("shows local fallback slides with keyboard-operable controls", async () => {
        render(
            <MemoryRouter>
                <LanguageProvider><CurrencyProvider><DataSaverProvider>
                    <HomeCarousel />
                </DataSaverProvider></CurrencyProvider></LanguageProvider>
            </MemoryRouter>
        );
        const next = await screen.findByRole("button", { name: "Next slide" });
        expect(screen.getByRole("button", { name: "Previous slide" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pause slideshow" })).toBeInTheDocument();
        expect(screen.getAllByRole("img")[0].getAttribute("src")).toMatch(/^\/images\/hero\//);
        expect(screen.getByRole("heading", { name: "Everything you need" })).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByRole("heading", { name: "From sellers you trust" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
        expect(screen.getByRole("button", { name: "Play slideshow" })).toHaveAttribute("aria-pressed", "true");
    });
});

describe("FloatingActions", () => {
    it("stays hidden at load, appears after the delay, and is immediate on checkout", () => {
        vi.useFakeTimers();
        const { unmount } = render(
            <MemoryRouter initialEntries={["/"]}><FloatingActions><button>help</button></FloatingActions></MemoryRouter>
        );
        expect(screen.queryByText("help")).toBeNull();
        act(() => { vi.advanceTimersByTime(FLOAT_DELAY_MS + 10); });
        expect(screen.getByText("help")).toBeInTheDocument();
        unmount();

        render(
            <MemoryRouter initialEntries={["/checkout"]}><FloatingActions><button>help2</button></FloatingActions></MemoryRouter>
        );
        expect(screen.getByText("help2")).toBeInTheDocument();
        vi.useRealTimers();
    });
});

import LanguageToggle from "../../src/components/LanguageToggle";

describe("LanguageToggle", () => {
    // Phase 9: the Swahili dictionary is now its own lazily dynamic-
    // imported chunk (see loadSwDictionary in LanguageContext.jsx), so the
    // Swahili-labelled button appears asynchronously - a moment, not
    // instantly - after the tap. findByRole (which retries) reflects that;
    // document.documentElement.lang still flips synchronously since that
    // only depends on the language code, not the dictionary content.
    it("switches between English and Kiswahili with one tap", async () => {
        render(<LanguageProvider><LanguageToggle /></LanguageProvider>);
        const btn = screen.getByRole("button", { name: "Switch language to Kiswahili" });
        fireEvent.click(btn);
        expect(document.documentElement.lang).toBe("sw");
        expect(await screen.findByRole("button", { name: "Badilisha lugha kuwa English" })).toBeInTheDocument();
    });
});
