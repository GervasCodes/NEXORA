import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/api/client", () => ({
    default: { get: vi.fn() }
}));

vi.mock("../../src/context/CurrencyContext", () => ({
    useCurrency: () => ({ format: (v) => `TZS ${v}` })
}));

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key) => key })
}));

import api from "../../src/api/client";
import AvailabilityCalendar from "../../src/components/AvailabilityCalendar";

// A date guaranteed to be available/non-past without needing to fake the
// system clock. Today itself qualifies - the component's isPast check is
// `dateKey < min`, not `<=` - and it's always inside whichever month the
// calendar renders by default, so there's no dependency on "tomorrow"
// staying in the same month as "today" (that broke on any month's last
// day, e.g. the 31st, since the calendar doesn't auto-advance to next
// month). The key is also built from local date parts (matching the
// component's own toDateKey), not toISOString()'s UTC conversion, which
// could otherwise disagree with the locally-numbered day cell the test
// looks up by name.
const pad = (n) => String(n).padStart(2, "0");
const today = new Date();
const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const todayDay = String(today.getDate());

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
                    { date: todayKey, available: true, availableUnits: 3, price: 10000 }
                ]
            }
        });

        const onDateClick = vi.fn();
        const user = userEvent.setup();
        render(<AvailabilityCalendar serviceId={5} clickable onDateClick={onDateClick} />);

        const openCell = await screen.findByRole("button", { name: todayDay });
        await waitFor(() => expect(openCell).not.toBeDisabled());
        await user.click(openCell);

        expect(onDateClick).toHaveBeenCalledWith(todayKey, expect.objectContaining({ available: true }));
    });

    it("does not call onDateClick for a day with no availability row", async () => {
        api.get.mockResolvedValueOnce({ data: { data: [] } });

        const onDateClick = vi.fn();
        render(<AvailabilityCalendar serviceId={5} clickable onDateClick={onDateClick} />);

        const cell = await screen.findByRole("button", { name: todayDay });
        expect(cell).toBeDisabled();
    });
});
