import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn() }
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

import api from "../../src/api/client";
import AvailabilityCalendar from "../../src/components/AvailabilityCalendar";

// A date guaranteed to be "today or later" (never disabled as past)
// without needing to fake the system clock - tomorrow is always still
// within the current or next calendar day, and the calendar always
// renders the *current* real month on mount.
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowKey = tomorrow.toISOString().slice(0, 10);
const tomorrowDay = String(tomorrow.getDate());

beforeEach(() => {
    api.get.mockReset();
});

describe("AvailabilityCalendar", () => {
    it("fetches availability for the current month on mount", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [] } });
        render(<AvailabilityCalendar serviceId={5} />);

        await waitFor(() => expect(api.get).toHaveBeenCalledWith(
            "/services/5/availability",
            expect.objectContaining({ params: expect.any(Object) })
        ));
    });

    it("invokes onDateClick only for a clickable, available day", async () => {
        api.get.mockResolvedValueOnce({
            data: {
                data: [
                    { date: tomorrowKey, available: true, availableUnits: 3, price: 10000 }
                ]
            }
        });

        const onDateClick = vi.fn();
        const user = userEvent.setup();
        render(<AvailabilityCalendar serviceId={5} clickable onDateClick={onDateClick} />);

        const openCell = await screen.findByRole("button", { name: tomorrowDay });
        await waitFor(() => expect(openCell).not.toBeDisabled());
        await user.click(openCell);

        expect(onDateClick).toHaveBeenCalledWith(tomorrowKey, expect.objectContaining({ available: true }));
    });

    it("does not call onDateClick for a day with no availability row", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [] } });

        const onDateClick = vi.fn();
        render(<AvailabilityCalendar serviceId={5} clickable onDateClick={onDateClick} />);

        const cell = await screen.findByRole("button", { name: tomorrowDay });
        expect(cell).toBeDisabled();
    });
});
