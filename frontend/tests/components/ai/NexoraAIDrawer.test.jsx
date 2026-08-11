import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockClose = vi.fn();
let mockAssistantState = { isOpen: false, pendingContext: null, open: vi.fn(), close: mockClose };
vi.mock("../../../src/context/AIAssistantContext", () => ({
    useAIAssistant: () => mockAssistantState
}));

const mockSendChatMessage = vi.fn();
const mockExplainOrderStatus = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    sendChatMessage: (...args) => mockSendChatMessage(...args),
    explainOrderStatus: (...args) => mockExplainOrderStatus(...args)
}));

import NexoraAIDrawer from "../../../src/components/ai/NexoraAIDrawer";

beforeEach(() => {
    mockSendChatMessage.mockReset();
    mockExplainOrderStatus.mockReset();
    mockClose.mockReset();
});

describe("NexoraAIDrawer", () => {
    it("renders nothing when closed", () => {
        mockAssistantState = { isOpen: false, pendingContext: null, open: vi.fn(), close: mockClose };
        const { container } = render(<NexoraAIDrawer />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows a generic greeting when opened with no context", () => {
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);
        expect(screen.getByText(/ask me about orders/i)).toBeInTheDocument();
    });

    it("fetches and shows the real order explanation when opened with an order context", async () => {
        mockExplainOrderStatus.mockResolvedValue({ explanation: "Your order is on its way.", aiGenerated: true });
        mockAssistantState = { isOpen: true, pendingContext: { type: "order", orderId: 42 }, open: vi.fn(), close: mockClose };

        render(<NexoraAIDrawer />);

        await waitFor(() => expect(mockExplainOrderStatus).toHaveBeenCalledWith(42));
        expect(await screen.findByText("Your order is on its way.")).toBeInTheDocument();
    });

    it("shows a graceful fallback message if the order-explain call fails", async () => {
        mockExplainOrderStatus.mockRejectedValue(new Error("network down"));
        mockAssistantState = { isOpen: true, pendingContext: { type: "order", orderId: 42 }, open: vi.fn(), close: mockClose };

        render(<NexoraAIDrawer />);

        expect(await screen.findByText(/couldn't load that order/i)).toBeInTheDocument();
    });

    it("sends a typed message and shows the reply", async () => {
        mockSendChatMessage.mockResolvedValue({ reply: "You can track it from Orders.", aiGenerated: false });
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };

        render(<NexoraAIDrawer />);

        await userEvent.type(screen.getByPlaceholderText(/ask nexora ai/i), "where is my order");
        await userEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(mockSendChatMessage).toHaveBeenCalledWith("where is my order");
        expect(await screen.findByText("You can track it from Orders.")).toBeInTheDocument();
        expect(screen.getByText("where is my order")).toBeInTheDocument();
    });

    it("shows a graceful fallback message when the chat call fails, never a raw error", async () => {
        mockSendChatMessage.mockRejectedValue(new Error("provider down"));
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };

        render(<NexoraAIDrawer />);

        await userEvent.type(screen.getByPlaceholderText(/ask nexora ai/i), "hello");
        await userEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    });

    it("calls close when the close button is clicked", async () => {
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        await userEvent.click(screen.getByRole("button", { name: /close nexora ai/i }));
        expect(mockClose).toHaveBeenCalled();
    });

    it("disables sending an empty message", () => {
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    });
});
