import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";
import Footer from "../../src/components/Footer";

const renderFooter = () =>
    render(
        <MemoryRouter>
            <LanguageProvider>
                <Footer />
            </LanguageProvider>
        </MemoryRouter>
    );

describe("Footer", () => {
    it("links to the system status page", () => {
        renderFooter();
        expect(screen.getByRole("link", { name: "System status" })).toHaveAttribute("href", "/status");
    });

    it("has exactly one legal link: Terms & Conditions (all documents live inside /terms)", () => {
        renderFooter();
        expect(screen.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/terms");
        expect(document.querySelectorAll('a[href^="/legal/"]').length).toBe(0);
    });

    it("no longer repeats header links or the install callout", () => {
        renderFooter();
        expect(screen.queryByRole("link", { name: "Shop all products" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Book services" })).toBeNull();
        expect(screen.queryByRole("button", { name: /install/i })).toBeNull();
    });

    it("shows the payment logos with accessible names", () => {
        renderFooter();
        const list = screen.getByRole("list", { name: "Accepted payment methods" });
        expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(6);
        expect(within(list).getByAltText("Visa")).toBeInTheDocument();
    });
});
