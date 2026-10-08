import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Phase 1 (Remediation, A5): guide bodies used to collapse single line
// breaks (JSX whitespace handling) and render markdown-style
// **bold**/*italic* as literal asterisks. These tests guard the new
// lightweight renderer.

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn() }
}));

// GuideDetail reads `t` off useLanguage() - without a <LanguageProvider>
// ancestor (none of these tests wrap with one) that context value is
// null, so destructuring `{ t }` throws. Reuse the real English
// dictionary instead of hand-copying the handful of keys this page
// needs, so this mock doesn't silently drift from LanguageContext.jsx.
vi.mock("../../src/context/LanguageContext", async () => {
    const actual = await vi.importActual("../../src/context/LanguageContext");
    return {
        ...actual,
        useLanguage: () => ({
            t: (key, params) => {
                const template = actual.DICTIONARY.en[key] || key;
                if (!params) return template;
                return template.replace(/\{(\w+)\}/g, (match, k) => (
                    params[k] !== undefined && params[k] !== null ? String(params[k]) : ""
                ));
            }
        })
    };
});

import api from "../../src/api/client";
import GuideDetail from "../../src/pages/GuideDetail";

const renderPage = (slug = "how-to-sell") =>
    render(
        <MemoryRouter initialEntries={[`/guides/${slug}`]}>
            <Routes>
                <Route path="/guides/:slug" element={<GuideDetail />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    api.get.mockReset();
});

describe("GuideDetail body rendering", () => {
    it("renders single line breaks within a paragraph as <br />, not collapsed whitespace", async () => {
        api.get.mockResolvedValue({
            data: { data: { title: "How to sell", body_markdown: "Line one.\nLine two." } }
        });

        renderPage();

        const paragraph = await screen.findByText(/Line one\./);
        expect(paragraph.querySelector("br")).not.toBeNull();
        expect(paragraph.textContent).toBe("Line one.Line two.");
    });

    it("renders **bold** and *italic* spans instead of literal asterisks", async () => {
        api.get.mockResolvedValue({
            data: { data: { title: "How to sell", body_markdown: "This is **important** and this is *emphasized*." } }
        });

        renderPage();

        const strong = await screen.findByText("important");
        expect(strong.tagName).toBe("STRONG");
        const em = await screen.findByText("emphasized");
        expect(em.tagName).toBe("EM");
        expect(screen.queryByText(/\*\*important\*\*/)).toBeNull();
    });

    it("still splits blank-line-separated text into separate paragraphs", async () => {
        api.get.mockResolvedValue({
            data: { data: { title: "How to sell", body_markdown: "First paragraph.\n\nSecond paragraph." } }
        });

        renderPage();

        const first = await screen.findByText("First paragraph.");
        const second = await screen.findByText("Second paragraph.");
        expect(first.tagName).toBe("P");
        expect(second.tagName).toBe("P");
        expect(first).not.toBe(second);
    });
});
