import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn(), put: vi.fn() },
    extractErrorMessage: (err) => err?.response?.data?.message || "Something went wrong"
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

const mockUser = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: mockUser() })
}));

import api, { extractErrorMessage } from "../../src/api/client";
import BookingDetail from "../../src/pages/BookingDetail";

const renderPage = (id = "7") =>
    render(
        <MemoryRouter initialEntries={[`/bookings/${id}`]}>
            <Routes>
                <Route path="/bookings/:id" element={<BookingDetail />} />
            </Routes>
        </MemoryRouter>
    );

const baseBooking = {
    id: 7,
    booking_reference: "BKG-ABC123-4567",
    status: "pending",
    payment_status: "unpaid",
    start_date: "2026-08-01",
    end_date: "2026-08-04",
    quantity: 1,
    amount: "450000.00",
    provider_id: 99,
    customer_id: 42,
    created_at: "2026-07-01T00:00:00.000Z",
    items: [
        { service_date: "2026-08-01", quantity: 1, unit_price: "150000.00", subtotal: "150000.00" }
    ]
};

beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    mockUser.mockReset();
});

describe("BookingDetail page", () => {
    it("shows a not-found state when the booking can't be loaded", async () => {
        api.get.mockRejectedValueOnce({ response: { data: { message: "Booking not found" } } });
        mockUser.mockReturnValue({ id: 42, role: "buyer" });
        renderPage();

        await waitFor(() => expect(screen.getByText("Booking not found")).toBeInTheDocument());
    });

    it("lets the provider confirm a pending booking", async () => {
        api.get.mockResolvedValue({ data: { data: baseBooking } });
        api.put.mockResolvedValueOnce({ data: { success: true } });
        mockUser.mockReturnValue({ id: 99, role: "seller" });

        const user = userEvent.setup();
        renderPage();

        await waitFor(() => expect(screen.getByText("BKG-ABC123-4567")).toBeInTheDocument());

        const confirmButton = screen.getByRole("button", { name: "Confirm booking" });
        await user.click(confirmButton);

        expect(api.put).toHaveBeenCalledWith("/bookings/7/confirm");
        await waitFor(() => expect(screen.getByText("Booking confirmed.")).toBeInTheDocument());
    });

    it("does not show a confirm button to the customer", async () => {
        api.get.mockResolvedValue({ data: { data: baseBooking } });
        mockUser.mockReturnValue({ id: 42, role: "buyer" });

        renderPage();

        await waitFor(() => expect(screen.getByText("BKG-ABC123-4567")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: "Confirm booking" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel booking" })).toBeInTheDocument();
    });

    it("surfaces an error message when cancelling fails", async () => {
        api.get.mockResolvedValue({ data: { data: baseBooking } });
        api.put.mockRejectedValueOnce({ response: { data: { message: "Booking can no longer be cancelled" } } });
        mockUser.mockReturnValue({ id: 42, role: "buyer" });

        const user = userEvent.setup();
        renderPage();

        await waitFor(() => expect(screen.getByText("BKG-ABC123-4567")).toBeInTheDocument());
        await user.click(screen.getByRole("button", { name: "Cancel booking" }));

        await waitFor(() =>
            expect(screen.getByText(extractErrorMessage({ response: { data: { message: "Booking can no longer be cancelled" } } })))
                .toBeInTheDocument()
        );
    });
});
