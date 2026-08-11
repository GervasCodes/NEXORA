import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockParseSearchQuery = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    parseSearchQuery: (...args) => mockParseSearchQuery(...args)
}));

import NexoraSmartSearch from "../../../src/components/ai/NexoraSmartSearch";

beforeEach(() => {
    mockParseSearchQuery.mockReset();
});

describe("NexoraSmartSearch", () => {
    it("applies the AI-parsed filters, including only price/sort fields that were actually set", async () => {
        mockParseSearchQuery.mockResolvedValue({ search: "running shoes", min_price: null, max_price: 50000, sort: "price_low", aiGenerated: true });
        const onApply = vi.fn();

        render(<NexoraSmartSearch onApply={onApply} />);
        await userEvent.type(screen.getByPlaceholderText(/ask nexora ai/i), "running shoes under 50000");
        await userEvent.click(screen.getByRole("button", { name: /search/i }));

        expect(onApply).toHaveBeenCalledWith({ search: "running shoes", max_price: 50000, sort: "price_low" });
    });

    it("falls back to searching the raw typed text if the AI call fails, and shows a notice", async () => {
        mockParseSearchQuery.mockRejectedValue(new Error("network down"));
        const onApply = vi.fn();

        render(<NexoraSmartSearch onApply={onApply} />);
        await userEvent.type(screen.getByPlaceholderText(/ask nexora ai/i), "cheap shoes");
        await userEvent.click(screen.getByRole("button", { name: /search/i }));

        expect(onApply).toHaveBeenCalledWith({ search: "cheap shoes" });
        expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
    });

    it("does not submit an empty query", async () => {
        const onApply = vi.fn();
        render(<NexoraSmartSearch onApply={onApply} />);

        expect(screen.getByRole("button", { name: /search/i })).toBeDisabled();
    });
});
