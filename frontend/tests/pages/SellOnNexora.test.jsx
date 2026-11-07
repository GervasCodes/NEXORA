import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

const mockAuth = vi.hoisted(() => ({ user: null }));
vi.mock("../../src/context/AuthContext", () => ({ useAuth: () => ({ user: mockAuth.user }) }));

import { SellOnNexora } from "../../src/pages/Marketing";

const renderPage = () =>
    render(
        <LanguageProvider>
            <MemoryRouter initialEntries={["/sell"]}><SellOnNexora /></MemoryRouter>
        </LanguageProvider>
    );

const stickyBar = () => document.querySelector("div.md\\:hidden.fixed");

beforeEach(() => { mockAuth.user = null; });

describe("/sell - sticky mobile CTA (Phase 8)", () => {
    it("pins a phone-only 'create a seller account' link for visitors", () => {
        renderPage();

        const bar = stickyBar();
        expect(bar).not.toBeNull();
        expect(bar.className).toContain("bottom-[var(--bottom-inset)]");
        const link = bar.querySelector("a");
        expect(link).toHaveAttribute("href", "/register");
        expect(link).toHaveTextContent("Create a seller account");
    });

    it("keeps the inline call to action as well", () => {
        renderPage();
        expect(screen.getAllByRole("link", { name: "Create a seller account" })).toHaveLength(2);
    });

    it("does not show the sign-up bar to a signed-in person", () => {
        mockAuth.user = { id: 1, role: "buyer" };
        renderPage();
        expect(stickyBar()).toBeNull();
    });
});
