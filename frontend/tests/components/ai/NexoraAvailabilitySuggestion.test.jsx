import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockSuggestAvailability = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    suggestAvailability: (...args) => mockSuggestAvailability(...args)
}));

import NexoraAvailabilitySuggestion from "../../../src/components/ai/NexoraAvailabilitySuggestion";

beforeEach(() => {
    mockSuggestAvailability.mockReset();
});

describe("NexoraAvailabilitySuggestion", () => {
    it("renders nothing without a serviceId, and never calls the API", () => {
        const { container } = render(<NexoraAvailabilitySuggestion serviceId="" refreshToken={0} />);
        expect(container).toBeEmptyDOMElement();
        expect(mockSuggestAvailability).not.toHaveBeenCalled();
    });

    it("fetches and shows the suggestion for a given service", async () => {
        mockSuggestAvailability.mockResolvedValue({ closedDates: ["2026-08-12"], busiestWeekday: "Saturday", suggestion: "Consider opening Saturdays.", aiGenerated: true });

        render(<NexoraAvailabilitySuggestion serviceId="7" refreshToken={0} />);

        expect(await screen.findByText("Consider opening Saturdays.")).toBeInTheDocument();
        expect(mockSuggestAvailability).toHaveBeenCalledWith("7");
    });

    it("renders nothing if the call fails", async () => {
        mockSuggestAvailability.mockRejectedValue(new Error("down"));

        const { container } = render(<NexoraAvailabilitySuggestion serviceId="7" refreshToken={0} />);

        await waitFor(() => expect(mockSuggestAvailability).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it("re-fetches when the serviceId changes", async () => {
        mockSuggestAvailability.mockResolvedValue({ closedDates: [], busiestWeekday: "Monday", suggestion: "All open.", aiGenerated: false });

        const { rerender } = render(<NexoraAvailabilitySuggestion serviceId="7" refreshToken={0} />);
        await screen.findByText("All open.");

        rerender(<NexoraAvailabilitySuggestion serviceId="9" refreshToken={0} />);

        await waitFor(() => expect(mockSuggestAvailability).toHaveBeenCalledWith("9"));
    });
});
