import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockExplainForecast = vi.fn();
const mockExplainPersonalizationHealth = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    explainForecast: (...args) => mockExplainForecast(...args),
    explainPersonalizationHealth: (...args) => mockExplainPersonalizationHealth(...args)
}));

import NexoraAdminInsights from "../../../src/components/ai/NexoraAdminInsights";

beforeEach(() => {
    mockExplainForecast.mockReset();
    mockExplainPersonalizationHealth.mockReset();
});

describe("NexoraAdminInsights", () => {
    it("shows both the forecast and personalization explanations once loaded", async () => {
        mockExplainForecast.mockResolvedValue({ explanation: "Revenue is trending up." });
        mockExplainPersonalizationHealth.mockResolvedValue({ explanation: "40% of buyers are repeat customers." });

        render(<NexoraAdminInsights />);

        expect(await screen.findByText("Revenue is trending up.")).toBeInTheDocument();
        expect(await screen.findByText("40% of buyers are repeat customers.")).toBeInTheDocument();
        expect(mockExplainForecast).toHaveBeenCalledWith("products");
    });

    it("shows whichever call succeeds if the other fails", async () => {
        mockExplainForecast.mockRejectedValue(new Error("down"));
        mockExplainPersonalizationHealth.mockResolvedValue({ explanation: "40% of buyers are repeat customers." });

        render(<NexoraAdminInsights />);

        expect(await screen.findByText("40% of buyers are repeat customers.")).toBeInTheDocument();
        expect(screen.queryByText(/Forecast/)).not.toBeInTheDocument();
    });

    it("renders nothing if both calls fail", async () => {
        mockExplainForecast.mockRejectedValue(new Error("down"));
        mockExplainPersonalizationHealth.mockRejectedValue(new Error("down"));

        const { container } = render(<NexoraAdminInsights />);

        await waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
        expect(container).toBeEmptyDOMElement();
    });
});
