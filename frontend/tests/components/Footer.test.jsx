import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";
import Footer from "../../src/components/Footer";
import { LEGAL_DOC_LIST } from "../../src/data/legalDocs";

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

    it("still renders a link for every legal document (compliance-required)", () => {
        render(
            <MemoryRouter>
                <LanguageProvider>
                    <Footer />
                </LanguageProvider>
            </MemoryRouter>
        );

        for (const doc of LEGAL_DOC_LIST) {
            expect(screen.getByRole("link", { name: doc.shortTitle })).toHaveAttribute("href", `/legal/${doc.slug}`);
        }
    });
});
