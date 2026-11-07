import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

const metaCalls = vi.hoisted(() => []);
vi.mock("../../src/components/PageMeta", () => ({
    default: (props) => { metaCalls.push(props); return null; }
}));

import LegalPage from "../../src/pages/legal/LegalPage";

const renderAt = (path) =>
    render(
        <LanguageProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/legal/:slug" element={<LegalPage />} />
                    <Route path="/terms" element={<div>Terms page</div>} />
                </Routes>
            </MemoryRouter>
        </LanguageProvider>
    );

beforeEach(() => { metaCalls.length = 0; });

describe("LegalPage - page meta (Phase 8)", () => {
    it("redirects a known document to /terms and keeps the redirect URL out of the index", () => {
        renderAt("/legal/privacy-policy");

        expect(screen.getByText("Terms page")).toBeInTheDocument();
        const meta = metaCalls[0];
        expect(meta.title).toBe("Privacy Policy");
        expect(meta.description).toBe("Read NEXORA's Privacy Policy.");
        expect(meta.noIndexFollow).toBe(true);
    });

    it("shows NotFound (which sets its own noindex) for an unknown document", () => {
        renderAt("/legal/not-a-document");

        expect(screen.queryByText("Terms page")).not.toBeInTheDocument();
        expect(metaCalls.some((m) => m.noIndex === true)).toBe(true);
    });
});
