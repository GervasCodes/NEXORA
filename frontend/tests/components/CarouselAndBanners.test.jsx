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

describe("HomeCarousel", () => {
    it("has no arrow or play/pause buttons and advances automatically", async () => {
        render(
            <MemoryRouter>
                <LanguageProvider><CurrencyProvider><DataSaverProvider>
                    <HomeCarousel />
                </DataSaverProvider></CurrencyProvider></LanguageProvider>
            </MemoryRouter>
        );
        expect(await screen.findByRole("heading", { name: "Everything you need" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Next slide" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Previous slide" })).toBeNull();
        expect(screen.queryByRole("button", { name: /slideshow/i })).toBeNull();
        expect(screen.getAllByRole("img")[0].getAttribute("src")).toMatch(/^\/images\/hero\//);
        expect(await screen.findByRole("heading", { name: "From sellers you trust" }, { timeout: 8000 })).toBeInTheDocument();
    }, 15000);
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
