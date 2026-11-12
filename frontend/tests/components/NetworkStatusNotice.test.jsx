import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

let staleListener = null;
vi.mock("../../src/api/client", () => ({
    default: { defaults: { baseURL: "http://localhost:5000/api/v1" } },
    getServerWaking: () => false,
    subscribeServerWaking: () => () => {},
    getStaleState: () => ({ stale: false, freshAvailable: false }),
    subscribeStale: (listener) => { staleListener = listener; return () => { staleListener = null; }; }
}));
vi.mock("../../src/context/ToastContext.jsx", () => ({ useToast: () => null }));
vi.mock("../../src/context/LanguageContext.jsx", () => ({ useLanguage: () => ({ t: (key) => key }) }));
vi.mock("../../src/utils/stockOfflineStore", () => ({ flushQueue: vi.fn(), queueCounts: vi.fn().mockResolvedValue({ pending: 0 }) }));

import NetworkStatusNotice from "../../src/components/NetworkStatusNotice.jsx";

describe("NetworkStatusNotice - saved information while the server wakes", () => {
    beforeEach(() => { staleListener = null; });

    it("shows nothing when everything is normal", () => {
        const { container } = render(<NetworkStatusNotice />);
        expect(container).toBeEmptyDOMElement();
    });

    it("says that saved information is being shown", () => {
        render(<NetworkStatusNotice />);
        act(() => staleListener({ stale: true, freshAvailable: false }));
        expect(screen.getByRole("status")).toHaveTextContent("network.staleShowing");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("offers a Refresh button once newer information is ready, and reloads when it is pressed", () => {
        const reload = vi.fn();
        Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });

        render(<NetworkStatusNotice />);
        act(() => staleListener({ stale: true, freshAvailable: true }));

        expect(screen.getByRole("status")).toHaveTextContent("network.freshReady");
        const button = screen.getByRole("button", { name: "network.refresh" });
        fireEvent.click(button);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
