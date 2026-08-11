import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIAssistantProvider, useAIAssistant } from "../../src/context/AIAssistantContext";

function Probe() {
    const assistant = useAIAssistant();
    return (
        <div>
            <p data-testid="open-state">{String(assistant.isOpen)}</p>
            <p data-testid="context">{JSON.stringify(assistant.pendingContext)}</p>
            <button onClick={() => assistant.open({ type: "order", orderId: 42 })}>open-with-order</button>
            <button onClick={() => assistant.open()}>open-plain</button>
            <button onClick={assistant.close}>close</button>
        </div>
    );
}

const renderProbe = () => render(<AIAssistantProvider><Probe /></AIAssistantProvider>);

describe("AIAssistantContext", () => {
    it("starts closed with no pending context", () => {
        renderProbe();
        expect(screen.getByTestId("open-state").textContent).toBe("false");
        expect(screen.getByTestId("context").textContent).toBe("null");
    });

    it("opens with a pending context when given one", async () => {
        renderProbe();
        await userEvent.click(screen.getByText("open-with-order"));

        expect(screen.getByTestId("open-state").textContent).toBe("true");
        expect(screen.getByTestId("context").textContent).toBe(JSON.stringify({ type: "order", orderId: 42 }));
    });

    it("opens with no pending context when opened plainly", async () => {
        renderProbe();
        await userEvent.click(screen.getByText("open-plain"));

        expect(screen.getByTestId("open-state").textContent).toBe("true");
        expect(screen.getByTestId("context").textContent).toBe("null");
    });

    it("clears both open state and pending context on close", async () => {
        renderProbe();
        await userEvent.click(screen.getByText("open-with-order"));
        await userEvent.click(screen.getByText("close"));

        expect(screen.getByTestId("open-state").textContent).toBe("false");
        expect(screen.getByTestId("context").textContent).toBe("null");
    });
});
