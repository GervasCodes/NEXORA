import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

let mockUser = null;
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: mockUser, sessionReady: true })
}));

// Home pulls in lots of data-driven sections that are irrelevant here.
vi.mock("../../src/api/client", () => ({
    default: {
        get: vi.fn(() => new Promise(() => {})),
        post: vi.fn(() => new Promise(() => {}))
    },
    extractErrorMessage: () => ""
}));
vi.mock("../../src/components/DepartmentCard", () => ({ default: () => null }));
vi.mock("../../src/components/ProductGrid", () => ({ default: () => null }));
vi.mock("../../src/components/ProductFilters", () => ({ default: () => null }));
vi.mock("../../src/components/RecommendedProducts", () => ({ default: () => null }));
vi.mock("../../src/components/HomeRails", () => ({ default: () => null }));
vi.mock("../../src/components/RecentlyViewedRail", () => ({ default: () => null }));
vi.mock("../../src/components/PaymentTrustBar", () => ({ default: () => null }));
vi.mock("../../src/components/HomeCarousel", () => ({ default: () => null }));

import Home from "../../src/pages/Home";

const renderHome = () =>
    render(
        <MemoryRouter>
            <LanguageProvider>
                <Home />
            </LanguageProvider>
        </MemoryRouter>
    );

describe("Home welcome-back line", () => {
    beforeEach(() => localStorage.clear());

    it("is plain muted text, not a pill, with no icon", () => {
        mockUser = { username: "kelvin14" };
        renderHome();
        const line = screen.getByText("Welcome back, kelvin14");
        expect(line.tagName).toBe("P");
        expect(line.className).not.toMatch(/rounded|border|\bbg-/);
        expect(line.querySelector("svg")).toBeNull();
        expect(line).toHaveClass("text-sm", "text-frost/60");
    });

    it("never wraps and truncates a very long username with an ellipsis", () => {
        mockUser = { username: "a".repeat(120) };
        renderHome();
        const line = screen.getByText(/^Welcome back, a+$/);
        expect(line).toHaveClass("whitespace-nowrap", "truncate", "max-w-full");
    });

    it("falls back to the first name when there is no username", () => {
        mockUser = { first_name: "Amina" };
        renderHome();
        expect(screen.getByText("Welcome back, Amina")).toBeInTheDocument();
    });

    it("is absent for signed-out visitors", () => {
        mockUser = null;
        renderHome();
        expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
    });

    it("is translated in Kiswahili", async () => {
        mockUser = { username: "kelvin14" };
        localStorage.setItem("nexora_language", "sw");
        renderHome();
        // The Swahili dictionary loads as a separate chunk, so wait for it.
        expect(await screen.findByText("Karibu tena, kelvin14")).toBeInTheDocument();
        expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
    });
});
