import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockGet = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args) }
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({
        t: (key) => ({
            "filters.store": "Store",
            "filters.allStores": "All stores",
            "filters.location": "Location",
            "filters.allLocations": "All locations",
            "filters.rating": "Rating",
            "filters.sortBy": "Sort by"
        }[key] || key)
    })
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ currency: "TZS", toTzs: (v) => (v === "" ? null : Number(v)) })
}));

import ProductFilters from "../../src/components/ProductFilters";

beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
});

describe("ProductFilters (Phase 3A-3C)", () => {
    it("fetches the seller and region dropdown options", async () => {
        render(<ProductFilters onChange={() => {}} />);

        await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/products/filters/sellers", { params: {} }));
        expect(mockGet).toHaveBeenCalledWith("/products/filters/regions", { params: {} });
        expect(screen.getByLabelText("Store")).toBeInTheDocument();
        expect(screen.getByLabelText("Location")).toBeInTheDocument();
    });
});

describe("ProductFilters singleStore (Phase 5C)", () => {
    it("hides the store and location dropdowns", async () => {
        render(<ProductFilters singleStore onChange={() => {}} />);

        expect(screen.getByLabelText("Rating")).toBeInTheDocument();
        expect(screen.queryByLabelText("Store")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    });

    it("never fetches seller or region options", async () => {
        render(<ProductFilters singleStore onChange={() => {}} />);

        // Give any stray effect a tick to fire before asserting it didn't.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockGet).not.toHaveBeenCalled();
    });

    it("still reports price/rating/sort changes via onChange", async () => {
        const onChange = vi.fn();
        render(<ProductFilters singleStore onChange={onChange} />);

        fireEvent.change(screen.getByLabelText("Rating"), { target: { value: "4" } });

        await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min_rating: "4" })));
        // No seller_id/region should ever be emitted in this mode.
        expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ seller_id: expect.anything() }));
        expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ region: expect.anything() }));
    });
});
