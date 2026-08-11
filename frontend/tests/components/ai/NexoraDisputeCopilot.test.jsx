import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSummarizeDispute = vi.fn();
const mockSuggestDisputeResolution = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    summarizeDispute: (...args) => mockSummarizeDispute(...args),
    suggestDisputeResolution: (...args) => mockSuggestDisputeResolution(...args)
}));

import NexoraDisputeCopilot from "../../../src/components/ai/NexoraDisputeCopilot";

beforeEach(() => {
    mockSummarizeDispute.mockReset();
    mockSuggestDisputeResolution.mockReset();
});

describe("NexoraDisputeCopilot - summary", () => {
    it("shows the summary once loaded", async () => {
        mockSummarizeDispute.mockResolvedValue({ summary: "Damaged item case, 2 days open." });
        mockSuggestDisputeResolution.mockResolvedValue({});

        render(<NexoraDisputeCopilot disputeId={42} onApply={vi.fn()} />);

        expect(await screen.findByText("Damaged item case, 2 days open.")).toBeInTheDocument();
        expect(mockSummarizeDispute).toHaveBeenCalledWith(42);
    });

    it("shows nothing for the summary if the call fails, but still offers the suggestion control", async () => {
        mockSummarizeDispute.mockRejectedValue(new Error("down"));

        render(<NexoraDisputeCopilot disputeId={42} onApply={vi.fn()} />);

        expect(await screen.findByText(/suggest a resolution/i)).toBeInTheDocument();
        expect(screen.queryByText(/nexora ai summary/i)).not.toBeInTheDocument();
    });
});

describe("NexoraDisputeCopilot - agentic resolution suggestion", () => {
    it("fetches and shows a suggestion, applying it via onApply without calling any resolve endpoint itself", async () => {
        mockSummarizeDispute.mockResolvedValue({ summary: "Damaged item case." });
        mockSuggestDisputeResolution.mockResolvedValue({
            suggestedResolution: "refund_partial",
            suggestedNote: "Matches this seller's usual precedent.",
            requiresReview: true,
            aiGenerated: true
        });
        const onApply = vi.fn();

        render(<NexoraDisputeCopilot disputeId={42} onApply={onApply} />);
        await userEvent.click(await screen.findByText(/suggest a resolution/i));

        expect(await screen.findByText("Matches this seller's usual precedent.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /use this suggestion/i }));

        expect(onApply).toHaveBeenCalledWith("refund_partial", "Matches this seller's usual precedent.");
        expect(mockSuggestDisputeResolution).toHaveBeenCalledWith(42);
    });

    it("does not offer to apply a 'no_action' suggestion - that isn't a Resolve-form option", async () => {
        mockSummarizeDispute.mockResolvedValue({ summary: "Case." });
        mockSuggestDisputeResolution.mockResolvedValue({
            suggestedResolution: "no_action",
            suggestedNote: "No history to suggest a refund.",
            requiresReview: true,
            aiGenerated: false
        });

        render(<NexoraDisputeCopilot disputeId={42} onApply={vi.fn()} />);
        await userEvent.click(await screen.findByText(/suggest a resolution/i));

        expect(await screen.findByText("No history to suggest a refund.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /use this suggestion/i })).not.toBeInTheDocument();
    });

    it("shows a graceful message if the suggestion call fails", async () => {
        mockSummarizeDispute.mockResolvedValue({ summary: "Case." });
        mockSuggestDisputeResolution.mockRejectedValue(new Error("down"));

        render(<NexoraDisputeCopilot disputeId={42} onApply={vi.fn()} />);
        await userEvent.click(await screen.findByText(/suggest a resolution/i));

        expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    });

    it("never calls onApply when there is no suggested resolution", async () => {
        mockSummarizeDispute.mockResolvedValue({ summary: "Case." });
        mockSuggestDisputeResolution.mockResolvedValue({
            suggestedResolution: null,
            suggestedNote: "No resolution history for this seller on this dispute type - review the case directly.",
            requiresReview: true,
            aiGenerated: false
        });
        const onApply = vi.fn();

        render(<NexoraDisputeCopilot disputeId={42} onApply={onApply} />);
        await userEvent.click(await screen.findByText(/suggest a resolution/i));

        expect(await screen.findByText(/review the case directly/i)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /use this suggestion/i })).not.toBeInTheDocument();
        expect(onApply).not.toHaveBeenCalled();
    });
});
