import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual("react-router-dom")),
    useNavigate: () => mockNavigate
}));

// Suggestions endpoints aren't what this test is about - every list call
// resolves empty so the debounced suggestion fetch is a harmless no-op.
vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(() => Promise.resolve({ data: { data: [] } })) }
}));

const mockParseSearchQuery = vi.fn();
vi.mock("../../src/api/ai", () => ({
    parseSearchQuery: (...args) => mockParseSearchQuery(...args)
}));

vi.mock("../../src/context/CurrencyContext", () => ({ useCurrency: () => ({ format: (v) => String(v) }) }));

// The real LanguageContext memoizes its `t`/value object (useCallback +
// useMemo), so its reference is stable across renders when the language
// hasn't changed. SearchBox's suggestions effect depends on `t` in its
// dependency array - a mock that hands back a fresh { t } object on every
// call breaks that assumption and the effect fires on every render,
// looping forever (setSuggestions([]) -> new state -> re-render -> new
// `t` -> effect fires again). Hoisting both outside keeps one stable
// reference, matching production.
const stableT = (key) => key;
const stableLanguageValue = { t: stableT };
vi.mock("../../src/context/LanguageContext", () => ({ useLanguage: () => stableLanguageValue }));

import SearchBox from "../../src/components/SearchBox";

const renderBox = () =>
    render(
        <MemoryRouter>
            <SearchBox placeholder="Search" submitLabel="Go" inputClassName="" />
        </MemoryRouter>
    );

const search = async (text) => {
    await userEvent.type(screen.getByPlaceholderText("Search"), text);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
};

beforeEach(() => {
    mockNavigate.mockReset();
    mockParseSearchQuery.mockReset();
    localStorage.clear();
});

describe("SearchBox natural-language search", () => {
    it("applies AI-parsed price/sort to the results URL, including only the fields that were set", async () => {
        mockParseSearchQuery.mockResolvedValue({ search: "running shoes", min_price: null, max_price: 50000, sort: "price_low", aiGenerated: true });

        renderBox();
        await search("running shoes under 50000");

        await vi.waitFor(() =>
            expect(mockNavigate).toHaveBeenCalledWith("/search?search=running%20shoes&max_price=50000&sort=price_low")
        );
    });

    it("falls back to a raw-text search, without throwing, if the AI parse fails", async () => {
        mockParseSearchQuery.mockRejectedValue(new Error("network down"));

        renderBox();
        await search("cheap shoes");

        await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/search?search=cheap%20shoes"));
    });

    it("skips the AI call for a single-word query", async () => {
        renderBox();
        await search("sneakers");

        await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/search?search=sneakers"));
        expect(mockParseSearchQuery).not.toHaveBeenCalled();
    });
});
