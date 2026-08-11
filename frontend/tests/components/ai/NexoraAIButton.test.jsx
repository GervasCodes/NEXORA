import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockOpen = vi.fn();
const mockUseAIAssistant = vi.fn(() => ({ isOpen: false, pendingContext: null, open: mockOpen, close: vi.fn() }));
vi.mock("../../../src/context/AIAssistantContext", () => ({
    useAIAssistant: () => mockUseAIAssistant()
}));

import NexoraAIButton from "../../../src/components/ai/NexoraAIButton";

describe("NexoraAIButton", () => {
    it("renders a clearly-labeled Nexora AI button", () => {
        render(<NexoraAIButton />);
        expect(screen.getByRole("button", { name: /nexora ai/i })).toBeInTheDocument();
    });

    it("opens the assistant with no preset context when clicked", async () => {
        render(<NexoraAIButton />);
        await userEvent.click(screen.getByRole("button", { name: /nexora ai/i }));
        expect(mockOpen).toHaveBeenCalledWith();
    });

    it("renders nothing if used outside the AIAssistantProvider", () => {
        mockUseAIAssistant.mockReturnValueOnce(null);
        const { container } = render(<NexoraAIButton />);
        expect(container).toBeEmptyDOMElement();
    });
});
