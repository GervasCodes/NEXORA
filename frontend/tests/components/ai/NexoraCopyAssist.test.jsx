import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGenerateListingDraft = vi.fn();
const mockGenerateMarketingCopy = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    generateListingDraft: (...args) => mockGenerateListingDraft(...args),
    generateMarketingCopy: (...args) => mockGenerateMarketingCopy(...args)
}));

import NexoraCopyAssist from "../../../src/components/ai/NexoraCopyAssist";

beforeEach(() => {
    mockGenerateListingDraft.mockReset();
    mockGenerateMarketingCopy.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("NexoraCopyAssist - listing mode", () => {
    it("requires a name before generating", async () => {
        render(<NexoraCopyAssist mode="product" name="" onApply={vi.fn()} />);
        await userEvent.click(screen.getByText(/draft with nexora ai/i));
        await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));

        expect(await screen.findByText(/add a name first/i)).toBeInTheDocument();
        expect(mockGenerateListingDraft).not.toHaveBeenCalled();
    });

    it("generates a draft and applies it via onApply when the seller chooses to use it", async () => {
        mockGenerateListingDraft.mockResolvedValue({ description: "A comfortable pair of sneakers.", aiGenerated: true, requiresReview: true });
        const onApply = vi.fn();

        render(<NexoraCopyAssist mode="product" name="Blue Sneakers" category="Shoes" onApply={onApply} />);
        await userEvent.click(screen.getByText(/draft with nexora ai/i));
        await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));

        expect(await screen.findByText("A comfortable pair of sneakers.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /use this draft/i }));

        expect(onApply).toHaveBeenCalledWith("A comfortable pair of sneakers.");
    });

    it("shows a graceful message if the draft call fails", async () => {
        mockGenerateListingDraft.mockRejectedValue(new Error("down"));

        render(<NexoraCopyAssist mode="product" name="Blue Sneakers" onApply={vi.fn()} />);
        await userEvent.click(screen.getByText(/draft with nexora ai/i));
        await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));

        expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    });
});

describe("NexoraCopyAssist - marketing mode", () => {
    it("copies the draft to the clipboard instead of calling onApply", async () => {
        mockGenerateMarketingCopy.mockResolvedValue({ copy: "Check out our sneakers!", aiGenerated: true, requiresReview: true });
        const onApply = vi.fn();

        render(<NexoraCopyAssist mode="marketing" name="Blue Sneakers" onApply={onApply} />);
        await userEvent.click(screen.getByText(/draft marketing copy/i));
        await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));

        expect(await screen.findByText("Check out our sneakers!")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Check out our sneakers!");
        expect(onApply).not.toHaveBeenCalled();
    });
});
