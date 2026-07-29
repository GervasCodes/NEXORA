import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockOutletContext = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useOutletContext: () => mockOutletContext() };
});

vi.mock("../../../src/api/client", () => ({
    default: { get: vi.fn(), put: vi.fn() },
    extractErrorMessage: () => "Something went wrong"
}));

import api from "../../../src/api/client";
import SellerBookings from "../../../src/pages/seller/SellerBookings";

const renderPage = () => render(<MemoryRouter><SellerBookings /></MemoryRouter>);

const booking = {
    id: 11,
    booking_reference: "BKG-XYZ999-1234",
    service_title: "City Car Rental",
    status: "pending",
    amount: "80000.00",
    start_date: "2026-09-01",
    end_date: "2026-09-01",
    customer_first_name: "Amina",
    customer_last_name: "Juma"
};

beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    mockOutletContext.mockReset();
});

describe("SellerBookings page", () => {
    it("gates non-service providers behind a message linking to Services", async () => {
        mockOutletContext.mockReturnValue({ profile: { merchant_type: "product" } });
        renderPage();

        expect(screen.getByText(/Bookings management is for service providers/)).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalled();
    });

    it("lists a provider's bookings with a confirm action for pending ones", async () => {
        mockOutletContext.mockReturnValue({ profile: { merchant_type: "service" } });
        api.get.mockResolvedValueOnce({ data: { data: [booking] } });

        renderPage();

        await waitFor(() => expect(screen.getByText("City Car Rental")).toBeInTheDocument());
        expect(screen.getByText("Amina Juma", { exact: false })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    });

    it("confirms a booking and reloads the list", async () => {
        mockOutletContext.mockReturnValue({ profile: { merchant_type: "hybrid" } });
        api.get.mockResolvedValue({ data: { data: [booking] } });
        api.put.mockResolvedValueOnce({ data: { success: true } });

        const user = userEvent.setup();
        renderPage();

        await waitFor(() => expect(screen.getByText("City Car Rental")).toBeInTheDocument());
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(api.put).toHaveBeenCalledWith("/bookings/11/confirm");
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    });
});
