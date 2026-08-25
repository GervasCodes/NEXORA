import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../src/api/client", () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
    extractErrorMessage: () => "Something went wrong"
}));

import api from "../../../src/api/client";
import SellerPromote from "../../../src/pages/seller/SellerPromote";

const pricing = { daily_rate: 1000, min_days: 1, max_days: 30 };

// Each tab's page loads three endpoints in parallel (pricing, campaigns,
// and a third list - products for Sponsorship, categories for the other
// two). Route every GET through one mock so all three tabs can mount.
const routeGet = (url) => {
    if (url.endsWith("/pricing")) return Promise.resolve({ data: { data: pricing } });
    if (url.endsWith("/campaigns")) return Promise.resolve({ data: { data: [] } });
    if (url === "/products/mine/list") return Promise.resolve({ data: { data: [] } });
    if (url.endsWith("/categories")) return Promise.resolve({ data: { data: [] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
};

const renderPage = (initialEntry = "/seller/promote") =>
    render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <SellerPromote />
        </MemoryRouter>
    );

beforeEach(() => {
    api.get.mockReset();
    api.get.mockImplementation(routeGet);
});

describe("SellerPromote hub (A3 consolidation)", () => {
    it("defaults to the Sponsored products tab", async () => {
        renderPage();

        expect(await screen.findByText("Your campaigns")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/seller/sponsorship/pricing");
        expect(screen.getByRole("tab", { name: "Sponsored products" })).toHaveAttribute("aria-selected", "true");
    });

    it("respects a ?tab= deep link into the Featured stores tab", async () => {
        renderPage("/seller/promote?tab=featured-store");

        await screen.findByText("Your campaigns");
        expect(api.get).toHaveBeenCalledWith("/seller/featured-store/pricing");
        expect(screen.getByRole("tab", { name: "Featured stores" })).toHaveAttribute("aria-selected", "true");
    });

    it("switches tabs on click, loading that tab's own data", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Your campaigns");

        await user.click(screen.getByRole("tab", { name: "Department sponsorship" }));

        await screen.findByText(/bump a department/i);
        expect(api.get).toHaveBeenCalledWith("/seller/department-sponsorship/pricing");
        expect(screen.getByRole("tab", { name: "Department sponsorship" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Sponsored products" })).toHaveAttribute("aria-selected", "false");
    });
});
