import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockExplainDeliveryRoute = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    explainDeliveryRoute: (...args) => mockExplainDeliveryRoute(...args)
}));

import NexoraRouteAssist from "../../../src/components/ai/NexoraRouteAssist";

beforeEach(() => {
    mockExplainDeliveryRoute.mockReset();
});

describe("NexoraRouteAssist", () => {
    it("shows the route suggestion once loaded", async () => {
        mockExplainDeliveryRoute.mockResolvedValue({ deliveries: [], suggestion: "Start with the nearest stop.", aiGenerated: true });

        render(<NexoraRouteAssist refreshToken={0} />);

        expect(await screen.findByText("Start with the nearest stop.")).toBeInTheDocument();
    });

    it("renders nothing if the call fails", async () => {
        mockExplainDeliveryRoute.mockRejectedValue(new Error("down"));

        const { container } = render(<NexoraRouteAssist refreshToken={0} />);

        await waitFor(() => expect(mockExplainDeliveryRoute).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it("re-fetches when refreshToken changes", async () => {
        mockExplainDeliveryRoute.mockResolvedValue({ deliveries: [], suggestion: "Route A.", aiGenerated: false });

        const { rerender } = render(<NexoraRouteAssist refreshToken={0} />);
        await screen.findByText("Route A.");

        mockExplainDeliveryRoute.mockResolvedValue({ deliveries: [], suggestion: "Route B.", aiGenerated: false });
        rerender(<NexoraRouteAssist refreshToken={1} />);

        expect(await screen.findByText("Route B.")).toBeInTheDocument();
        expect(mockExplainDeliveryRoute).toHaveBeenCalledTimes(2);
    });
});
