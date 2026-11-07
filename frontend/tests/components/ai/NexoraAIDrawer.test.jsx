import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockClose = vi.fn();
let mockAssistantState = { isOpen: false, pendingContext: null, open: vi.fn(), close: mockClose };
vi.mock("../../../src/context/AIAssistantContext", () => ({
    useAIAssistant: () => mockAssistantState
}));

// Real dictionaries, switchable per test, so the assertions below check the
// actual English and Swahili strings the drawer ships with.
import en from "../../../src/i18n/en";
import sw from "../../../src/i18n/sw";
let mockLanguage = "en";
vi.mock("../../../src/context/LanguageContext", () => ({
    useLanguage: () => {
        const dict = mockLanguage === "sw" ? sw : en;
        return { language: mockLanguage, t: (key) => dict[key] || en[key] || key };
    }
}));

const mockSendChatMessage = vi.fn();
const mockExplainOrderStatus = vi.fn();
const mockExplainProduct = vi.fn();
const mockExplainBooking = vi.fn();
vi.mock("../../../src/api/ai", () => ({
    sendChatMessage: (...args) => mockSendChatMessage(...args),
    explainOrderStatus: (...args) => mockExplainOrderStatus(...args),
    explainProduct: (...args) => mockExplainProduct(...args),
    explainBooking: (...args) => mockExplainBooking(...args)
}));

import NexoraAIDrawer from "../../../src/components/ai/NexoraAIDrawer";

beforeEach(() => {
    mockSendChatMessage.mockReset();
    mockExplainOrderStatus.mockReset();
    mockExplainProduct.mockReset();
    mockExplainBooking.mockReset();
    mockClose.mockReset();
    mockLanguage = "en";
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
        expect(screen.getByText(/ask me anything about nexora/i)).toBeInTheDocument();
    });

    it("shows the Swahili welcome text and topic buttons when the language is Swahili", () => {
        mockLanguage = "sw";
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        expect(screen.getByText(/niulize chochote kuhusu nexora/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Fuatilia agizo langu" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/uliza nexora assistant/i)).toBeInTheDocument();
    });

    it("offers the suggested-topic buttons with the welcome message", () => {
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        const group = screen.getByRole("group", { name: /pick a topic/i });
        expect(group.querySelectorAll("button")).toHaveLength(6);
    });

    it("sends the topic's question when a topic button is tapped, with the UI language", async () => {
        mockSendChatMessage.mockResolvedValue({ reply: "Open Orders...", aiGenerated: false, suggestedTopics: [] });
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        await userEvent.click(screen.getByRole("button", { name: "Track my order" }));

        expect(mockSendChatMessage).toHaveBeenCalledWith("How do I track my order?", expect.objectContaining({ language: "en" }));
        expect(await screen.findByText("Open Orders...")).toBeInTheDocument();
    });

    it("sends the Swahili question for a topic button in Swahili", async () => {
        mockLanguage = "sw";
        mockSendChatMessage.mockResolvedValue({ reply: "Fungua Maagizo...", aiGenerated: false, suggestedTopics: [] });
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        await userEvent.click(screen.getByRole("button", { name: "Ghairi agizo" }));

        expect(mockSendChatMessage).toHaveBeenCalledWith("Nighairije agizo?", expect.objectContaining({ language: "sw" }));
    });

    it("shows topic buttons instead of a dead end when the server says it is not sure", async () => {
        mockSendChatMessage.mockResolvedValue({
            reply: "I'm not sure about that one.",
            aiGenerated: false,
            suggestedTopics: ["payments", "support", "not_a_real_topic"]
        });
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        await userEvent.type(screen.getByPlaceholderText(/ask nexora assistant/i), "qwerty");
        await userEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(await screen.findByText("I'm not sure about that one.")).toBeInTheDocument();
        const groups = screen.getAllByRole("group", { name: /pick a topic/i });
        expect(groups).toHaveLength(1);
        const labels = Array.from(groups[0].querySelectorAll("button")).map((b) => b.textContent);
        expect(labels).toEqual(["Payment options", "Contact support"]);
    });

    it("shows the usage-limit note in the active language", async () => {
        mockLanguage = "sw";
        mockSendChatMessage.mockResolvedValue({ reply: "Mambo!", aiGenerated: false, suggestedTopics: [], unavailableReason: "USER_DAILY_CAP" });
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        await userEvent.type(screen.getByPlaceholderText(/uliza nexora assistant/i), "hi");
        await userEvent.click(screen.getByRole("button", { name: /tuma/i }));

        expect(await screen.findByText(/kikomo cha matumizi cha leo/i)).toBeInTheDocument();
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

        await userEvent.type(screen.getByPlaceholderText(/ask nexora assistant/i), "where is my order");
        await userEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(mockSendChatMessage).toHaveBeenCalledWith("where is my order", {
            history: [{ role: "assistant", content: en["assistant.welcome"] }],
            language: "en"
        });
        expect(await screen.findByText("You can track it from Orders.")).toBeInTheDocument();
        expect(screen.getByText("where is my order")).toBeInTheDocument();
    });

    it("shows a graceful fallback message when the chat call fails, never a raw error", async () => {
        mockSendChatMessage.mockRejectedValue(new Error("provider down"));
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };

        render(<NexoraAIDrawer />);

        await userEvent.type(screen.getByPlaceholderText(/ask nexora assistant/i), "hello");
        await userEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    });

    it("calls close when the close button is clicked", async () => {
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        await userEvent.click(screen.getByRole("button", { name: /close nexora assistant/i }));
        expect(mockClose).toHaveBeenCalled();
    });

    it("disables sending an empty message", () => {
        mockAssistantState = { isOpen: true, pendingContext: null, open: vi.fn(), close: mockClose };
        render(<NexoraAIDrawer />);

        expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    });
});
