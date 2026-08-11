import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockSummarizeSellerAnalytics = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    summarizeSellerAnalytics: (...args) => mockSummarizeSellerAnalytics(...args)
}));

import NexoraAnalyticsSummary from "../../../src/components/ai/NexoraAnalyticsSummary";

beforeEach(() => {
    mockSummarizeSellerAnalytics.mockReset();
});

describe("NexoraAnalyticsSummary", () => {
    it("shows the summary once loaded", async () => {
        mockSummarizeSellerAnalytics.mockResolvedValue({ summary: "Solid month with 12 orders.", aiGenerated: true });

        render(<NexoraAnalyticsSummary />);

        expect(await screen.findByText("Solid month with 12 orders.")).toBeInTheDocument();
    });

    it("renders nothing if the call fails", async () => {
        mockSummarizeSellerAnalytics.mockRejectedValue(new Error("down"));

        const { container } = render(<NexoraAnalyticsSummary />);

        await waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
        expect(container).toBeEmptyDOMElement();
    });
});
