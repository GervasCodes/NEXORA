import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockExplainFraudQueue = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    explainFraudQueue: (...args) => mockExplainFraudQueue(...args)
}));

import NexoraFraudExplain from "../../../src/components/ai/NexoraFraudExplain";

beforeEach(() => {
    mockExplainFraudQueue.mockReset();
});

describe("NexoraFraudExplain", () => {
    it("shows the queue explanation once loaded", async () => {
        mockExplainFraudQueue.mockResolvedValue({ openCount: 2, explanation: "2 open flags, review the high severity one first." });

        render(<NexoraFraudExplain refreshToken={0} />);

        expect(await screen.findByText("2 open flags, review the high severity one first.")).toBeInTheDocument();
    });

    it("renders nothing when there are no open flags", async () => {
        mockExplainFraudQueue.mockResolvedValue({ openCount: 0, explanation: "No open fraud flags right now." });

        const { container } = render(<NexoraFraudExplain refreshToken={0} />);

        await waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing if the call fails", async () => {
        mockExplainFraudQueue.mockRejectedValue(new Error("down"));

        const { container } = render(<NexoraFraudExplain refreshToken={0} />);

        await waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
        expect(container).toBeEmptyDOMElement();
    });

    it("re-fetches when refreshToken changes", async () => {
        mockExplainFraudQueue.mockResolvedValue({ openCount: 1, explanation: "1 open flag." });

        const { rerender } = render(<NexoraFraudExplain refreshToken={0} />);
        await screen.findByText("1 open flag.");
        expect(mockExplainFraudQueue).toHaveBeenCalledTimes(1);

        rerender(<NexoraFraudExplain refreshToken={1} />);
        await waitFor(() => expect(mockExplainFraudQueue).toHaveBeenCalledTimes(2));
    });
});
