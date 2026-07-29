import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn() }
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

import api from "../../src/api/client";
import Bookings from "../../src/pages/Bookings";

const renderPage = () => render(<MemoryRouter><Bookings /></MemoryRouter>);

const booking = {
    id: 7,
    booking_reference: "BKG-ABC123-4567",
    service_title: "Serengeti Safari Lodge",
    status: "confirmed",
    amount: "450000.00",
    start_date: "2026-08-01",
    end_date: "2026-08-04"
};

beforeEach(() => {
    api.get.mockReset();
});

describe("Bookings page", () => {
    it("shows an empty state when the buyer has no bookings", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [] } });
        renderPage();

        await waitFor(() => expect(screen.getByText("No bookings yet")).toBeInTheDocument());
        expect(api.get).toHaveBeenCalledWith("/bookings/mine");
    });

    it("lists bookings with their status, dates, and amount", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [booking] } });
        renderPage();

        await waitFor(() => expect(screen.getByText("Serengeti Safari Lodge")).toBeInTheDocument());
        expect(screen.getByText("BKG-ABC123-4567")).toBeInTheDocument();
        expect(screen.getByText("confirmed")).toBeInTheDocument();
        expect(screen.getByText("TZS 450000.00")).toBeInTheDocument();
    });
});
