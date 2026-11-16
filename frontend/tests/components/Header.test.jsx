import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../../src/context/LanguageContext";

let mockUser = null;
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: mockUser, sessionReady: true, logout: vi.fn() })
}));

vi.mock("../../src/context/CartContext", () => ({
    useCart: () => ({ itemCount: 0 })
}));

vi.mock("../../src/hooks/useUnreadMessagesCount", () => ({
    useUnreadMessagesCount: () => 0
}));

// ThemeToggle (rendered inside Header) reads this - without a mock
// useTheme() returns the real context's null default and crashes.
vi.mock("../../src/context/ThemeContext", () => ({
    useTheme: () => ({ theme: "system", setTheme: vi.fn() })
}));

// SearchBox/NotificationBell pull in their own API calls and aren't
// what this test is about - stub them out so this stays focused on
// Header's own nav-link wiring (A2). NotificationBell now covers what
// AdminNotificationBell used to (Phase 3 notification consolidation) -
// there's no separate component to mock anymore.
vi.mock("../../src/components/SearchBox", () => ({ default: () => null }));
vi.mock("../../src/components/NotificationBell", () => ({ default: () => null }));

import Header from "../../src/components/Header";

const renderHeader = () =>
    render(
        <MemoryRouter>
            <LanguageProvider>
                <Header />
            </LanguageProvider>
        </MemoryRouter>
    );

describe("Header nav links (A2 audit)", () => {
    it("links to Browse for a signed-out visitor, but not Services (moved to the homepage)", () => {
        mockUser = null;
        renderHeader();

        expect(screen.getAllByRole("link", { name: "Browse all" }).length).toBeGreaterThan(0);
        // Services used to have its own permanent icon in both the desktop
        // row and the mobile drawer - it's now only reachable from the
        // homepage's own Services promo card (see Home.jsx), not the
        // global header, so neither instance should render here anymore.
        expect(screen.queryByRole("link", { name: "Services" })).not.toBeInTheDocument();
    });

    it("surfaces Returns for a signed-in buyer via the Tools menu", async () => {
        mockUser = { id: 1, role: "buyer" };
        const user = userEvent.setup();
        renderHeader();

        // "Returns" is a secondary link, so it lives inside ToolsMenu's
        // dropdown - open it before asserting the link is reachable.
        await user.click(screen.getByRole("button", { name: "More tools" }));

        expect(screen.getAllByRole("link", { name: "Returns" }).length).toBeGreaterThan(0);
    });

    it("does not show buyer-only links like Returns for a seller", async () => {
        mockUser = { id: 2, role: "seller" };
        const user = userEvent.setup();
        renderHeader();

        const toolsButton = screen.queryByRole("button", { name: "More tools" });
        if (toolsButton) await user.click(toolsButton);

        expect(screen.queryByRole("link", { name: "Returns" })).not.toBeInTheDocument();
    });
});

describe("Header mobile search row (scroll flicker fix)", () => {
    const ROW_H = 56;
    const setScroll = (y, { scrollHeight = 5000, innerHeight = 800 } = {}) => {
        Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
        Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true, writable: true });
        Object.defineProperty(document.documentElement, "scrollHeight", { value: scrollHeight, configurable: true });
        fireEvent.scroll(window);
    };
    const mountWithRowHeight = () => {
        const spy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(ROW_H);
        mockUser = null;
        const utils = renderHeader();
        const header = utils.container.querySelector("header");
        const row = header.querySelector(":scope > div[aria-hidden]");
        return { header, row, spy };
    };

    afterEach(() => {
        vi.restoreAllMocks();
        setScroll(0);
    });

    it("hides the row by moving the sticky offset, never by shrinking the header", () => {
        const { header, row } = mountWithRowHeight();
        setScroll(0);
        expect(header.style.top).toBe("0px");
        expect(row).toHaveAttribute("aria-hidden", "false");

        setScroll(200);
        setScroll(300);
        expect(header.style.top).toBe(`-${ROW_H}px`);
        expect(row).toHaveAttribute("aria-hidden", "true");
        // The old fix animated max-height to 0, which changed the document
        // height and made the row flicker at the bottom of long pages.
        expect(row.className).not.toMatch(/max-h-|overflow-hidden/);
        expect(row.className).toContain("pb-3");
    });

    it("brings the row back on scroll up and when near the top", () => {
        const { header } = mountWithRowHeight();
        setScroll(200);
        setScroll(400);
        expect(header.style.top).toBe(`-${ROW_H}px`);

        setScroll(380);
        expect(header.style.top).toBe("0px");

        setScroll(400);
        expect(header.style.top).toBe(`-${ROW_H}px`);
        setScroll(20);
        expect(header.style.top).toBe("0px");
    });

    it("does not flip while resting at the very bottom of the page (rubber-band / clamping)", () => {
        const { header } = mountWithRowHeight();
        const page = { scrollHeight: 2000, innerHeight: 800 };
        setScroll(500, page);
        setScroll(700, page);
        expect(header.style.top).toBe(`-${ROW_H}px`);

        // The bottom is y = 1200. Over-scrolling past it and bouncing back
        // reports a reverse move of more than 4px; that must not re-open the row.
        setScroll(1200, page);
        setScroll(1212, page);
        setScroll(1200, page);
        expect(header.style.top).toBe(`-${ROW_H}px`);
    });
});
