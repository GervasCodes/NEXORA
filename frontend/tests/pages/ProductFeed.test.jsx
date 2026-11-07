import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

// Helmet is mocked globally (tests/setupTests.js), so capture PageMeta's props instead.
const metaCalls = vi.hoisted(() => []);
vi.mock("../../src/components/PageMeta", () => ({
    default: (props) => { metaCalls.push(props); return null; }
}));
vi.mock("../../src/components/ProductGrid", () => ({ default: () => <div data-testid="grid" /> }));
vi.mock("../../src/components/ProductFilters", () => ({ default: () => null }));

import ProductFeed from "../../src/pages/ProductFeed";

beforeEach(() => { metaCalls.length = 0; });

describe("ProductFeed - page meta (Phase 8)", () => {
    it("sets a title and description and leaves the page indexable", () => {
        render(
            <LanguageProvider>
                <MemoryRouter initialEntries={["/feed"]}><ProductFeed /></MemoryRouter>
            </LanguageProvider>
        );

        const meta = metaCalls.at(-1);
        expect(meta.title).toBe("All products");
        expect(meta.description).toBe("Browse every product on NEXORA, across every department.");
        expect(meta.noIndex).toBeFalsy();
        expect(meta.noIndexFollow).toBeFalsy();
    });

    it("uses the same meta for filtered / store-scoped feeds (canonical drops the query in PageMeta)", () => {
        render(
            <LanguageProvider>
                <MemoryRouter initialEntries={["/feed?seller_id=42&sort=newest"]}><ProductFeed /></MemoryRouter>
            </LanguageProvider>
        );

        expect(metaCalls.at(-1).keepParams).toBeUndefined();
    });
});
