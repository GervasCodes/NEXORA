import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

// SearchBox/NotificationBell/AdminNotificationBell/MobileBottomNav pull in
// their own API calls and aren't what this test is about - stub them out
// so this stays focused on Header's own nav-link wiring (A2).
vi.mock("../../src/components/SearchBox", () => ({ default: () => null }));
vi.mock("../../src/components/NotificationBell", () => ({ default: () => null }));
vi.mock("../../src/components/AdminNotificationBell", () => ({ default: () => null }));
vi.mock("../../src/components/MobileBottomNav", () => ({ default: () => null }));

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
    it("links to Services alongside Browse for a signed-out visitor", () => {
        mockUser = null;
        renderHeader();

        // Two "Services" instances render: the desktop icon link and the
        // mobile drawer's (hidden but present) row - both should exist.
        expect(screen.getAllByRole("link", { name: "Services" }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("link", { name: "Browse all" }).length).toBeGreaterThan(0);
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
