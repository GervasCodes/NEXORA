import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";
import Footer from "../../src/components/Footer";

describe("Footer", () => {
    it("links to the system status page", () => {
        render(
            <MemoryRouter>
                <LanguageProvider>
                    <Footer />
                </LanguageProvider>
            </MemoryRouter>
        );

        expect(screen.getByRole("link", { name: "System status" })).toHaveAttribute("href", "/status");
    });
});
