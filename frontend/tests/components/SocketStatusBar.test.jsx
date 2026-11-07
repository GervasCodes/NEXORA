import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import SocketStatusBar from "../../src/components/SocketStatusBar";

let socketState = { connectionState: "connected" };
vi.mock("../../src/context/SocketContext", () => ({ useSocket: () => socketState }));
vi.mock("../../src/context/LanguageContext", () => ({ useLanguage: () => ({ t: (k) => k }) }));

describe("SocketStatusBar", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("renders nothing while connected", () => {
        socketState = { connectionState: "connected" };
        const { container } = render(<SocketStatusBar />);
        expect(container).toBeEmptyDOMElement();
    });

    it("does not flash for a brief reconnect blip", () => {
        socketState = { connectionState: "reconnecting" };
        render(<SocketStatusBar />);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows a labelled pulse bar once reconnecting lasts long enough", () => {
        socketState = { connectionState: "reconnecting" };
        render(<SocketStatusBar />);
        act(() => { vi.advanceTimersByTime(1600); });
        expect(screen.getByRole("status")).toHaveTextContent("pulse.reconnecting");
    });

    it("hides again as soon as the socket reconnects", () => {
        socketState = { connectionState: "reconnecting" };
        const { rerender } = render(<SocketStatusBar />);
        act(() => { vi.advanceTimersByTime(1600); });
        socketState = { connectionState: "connected" };
        rerender(<SocketStatusBar />);
        expect(screen.queryByRole("status")).toBeNull();
    });
});
