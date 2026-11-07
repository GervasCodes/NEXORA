import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";
import TermsPage from "../../src/pages/legal/TermsPage";
import LegalPage from "../../src/pages/legal/LegalPage";
import { LEGAL_DOC_LIST } from "../../src/data/legalDocs";

const renderAt = (path) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <LanguageProvider>
                <Routes>
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/legal/:slug" element={<LegalPage />} />
                </Routes>
            </LanguageProvider>
        </MemoryRouter>
    );

describe("TermsPage", () => {
    it("renders every legal document as an anchored section with an audience label", () => {
        const { container } = renderAt("/terms");
        for (const d of LEGAL_DOC_LIST) {
            const section = container.querySelector(`section#${d.slug}`);
            expect(section).not.toBeNull();
            expect(section.textContent).toContain("Applies to:");
        }
        expect(screen.getByRole("heading", { level: 1, name: "Terms & Conditions" })).toBeInTheDocument();
    });

    it("namespaces heading ids per document so they never collide", () => {
        const { container } = renderAt("/terms");
        const ids = [...container.querySelectorAll("[id]")].map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("redirects the legacy /legal/:slug URL to the matching section", () => {
        const { container } = renderAt("/legal/refund-policy");
        expect(container.querySelector("section#refund-policy")).not.toBeNull();
    });

    it("rewrites cross-links between documents to in-page anchors", () => {
        const { container } = renderAt("/terms");
        expect(container.querySelector('a[href^="/legal/"]')).toBeNull();
        expect(container.querySelector('a[href="/terms#privacy-policy"]')).not.toBeNull();
    });
});
