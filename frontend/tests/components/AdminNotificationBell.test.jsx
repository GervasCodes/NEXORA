import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock("../../src/api/client", () => ({
    default: { get: (...args) => mockGet(...args), put: (...args) => mockPut(...args) }
}));

let mockUser = { role: "admin" };
vi.mock("../../src/context/AuthContext", () => ({
    useAuth: () => ({ user: mockUser })
}));

let mockSocket = null;
vi.mock("../../src/context/SocketContext", () => ({
    useSocket: () => ({ socket: mockSocket })
}));

vi.mock("../../src/context/ToastContext", () => ({
    useToast: () => ({ error: vi.fn() })
}));

import AdminNotificationBell from "../../src/components/AdminNotificationBell";

describe("AdminNotificationBell", () => {
    beforeEach(() => {
        mockUser = { role: "admin" };
        mockSocket = null;
        mockGet.mockReset();
        mockPut.mockReset();
        mockGet.mockResolvedValue({ data: { data: { unread: 0 } } });
    });

    it("renders nothing for a non-admin user (shared feed is admin-only)", () => {
        mockUser = { role: "buyer" };
        const { container } = render(<AdminNotificationBell />, { wrapper: MemoryRouter });
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the shared unread count for an admin", async () => {
        mockGet.mockResolvedValue({ data: { data: { unread: 3 } } });
        render(<AdminNotificationBell />, { wrapper: MemoryRouter });

        expect(await screen.findByText("3")).toBeInTheDocument();
    });

    it("caps the badge at '99+' for large counts", async () => {
        mockGet.mockResolvedValue({ data: { data: { unread: 150 } } });
        render(<AdminNotificationBell />, { wrapper: MemoryRouter });

        expect(await screen.findByText("99+")).toBeInTheDocument();
    });

    it("marks all as read and zeroes the shared badge when 'mark all read' is clicked", async () => {
        mockGet.mockImplementation((url) => {
            if (url === "/admin/notifications/unread-count") return Promise.resolve({ data: { data: { unread: 2 } } });
            return Promise.resolve({
                data: {
                    data: [
                        { id: 1, title: "New seller registered", message: "x", is_read: false, created_at: "2026-07-01T00:00:00Z" }
                    ]
                }
            });
        });
        mockPut.mockResolvedValue({});

        render(<AdminNotificationBell />, { wrapper: MemoryRouter });
        await screen.findByText("2");

        fireEvent.click(screen.getByLabelText("Admin notifications"));
        const markAllButton = await screen.findByText(/mark all/i);
        fireEvent.click(markAllButton);

        await waitFor(() => expect(mockPut).toHaveBeenCalledWith("/admin/notifications/read-all"));
        expect(screen.queryByText("2")).not.toBeInTheDocument();
    });
});
