jest.mock("../../../src/modules/notification/notification.repository");
jest.mock("../../../src/modules/adminNotification/adminNotification.service");
jest.mock("../../../src/utils/sendEmail");
jest.mock("../../../src/i18n", () => ({
    resolveLocale: jest.fn((lang) => lang || "en"),
    t: jest.fn((locale, key, params) => {
        if (!params) return `${locale}:${key}`;
        const resolvedParams = Object.entries(params)
            .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
            .join(",");
        return `${locale}:${key}(${resolvedParams})`;
    })
}));

const notificationRepository = require("../../../src/modules/notification/notification.repository");
const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");
const sendEmail = require("../../../src/utils/sendEmail");
const { t, resolveLocale } = require("../../../src/i18n");
const notificationService = require("../../../src/modules/notification/notification.service");

describe("notification.service.notify", () => {
    it("resolves title/message from translation keys in the recipient's saved locale, not a default", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "sw", email: null });
        resolveLocale.mockReturnValue("sw");

        await notificationService.notify({
            userId: 1,
            type: "order_placed",
            titleKey: "notifications.order.placed.title",
            messageKey: "notifications.order.placed.messageSingle",
            messageParams: { orderNumber: "ORD-1" },
            relatedOrderId: 5
        });

        expect(resolveLocale).toHaveBeenCalledWith("sw");
        expect(notificationRepository.create).toHaveBeenCalledWith(
            1,
            "order_placed",
            "sw:notifications.order.placed.title",
            "sw:notifications.order.placed.messageSingle(orderNumber=ORD-1)",
            5,
            undefined
        );
    });

    it("resolves a nested { key, params } messageParam value before interpolating it", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "en", email: null });
        resolveLocale.mockReturnValue("en");

        await notificationService.notify({
            userId: 1,
            type: "dispute_updated",
            messageKey: "notifications.dispute.updated",
            messageParams: { status: { key: "dispute.status.resolved" } }
        });

        // The nested key must be resolved via t() before being handed to the outer t() call
        expect(t).toHaveBeenCalledWith("en", "dispute.status.resolved", undefined);
        expect(notificationRepository.create).toHaveBeenCalledWith(
            1,
            "dispute_updated",
            undefined,
            "en:notifications.dispute.updated(status=en:dispute.status.resolved)",
            undefined,
            undefined
        );
    });

    it("falls back to plain title/message when no key is given", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "en", email: null });
        resolveLocale.mockReturnValue("en");

        await notificationService.notify({
            userId: 1,
            type: "custom",
            title: "Plain title",
            message: "Plain message"
        });

        expect(notificationRepository.create).toHaveBeenCalledWith(
            1, "custom", "Plain title", "Plain message", undefined, undefined
        );
    });

    it("does not send an email when withEmail is false, even if the user has one on file", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "en", email: "buyer@example.com" });
        resolveLocale.mockReturnValue("en");

        await notificationService.notify({ userId: 1, type: "custom", title: "T", message: "M", withEmail: false });

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("does not send an email when withEmail is true but the user has no email on file", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "en", email: null });
        resolveLocale.mockReturnValue("en");

        await notificationService.notify({ userId: 1, type: "custom", title: "T", message: "M", withEmail: true });

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("sends an email with the resolved title/message when withEmail is true and an email exists", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "en", email: "buyer@example.com" });
        resolveLocale.mockReturnValue("en");

        await notificationService.notify({ userId: 1, type: "custom", title: "T", message: "M", withEmail: true });

        expect(sendEmail).toHaveBeenCalledWith("buyer@example.com", "T", expect.stringContaining("M"));
    });

    // Phase 6 (UI/UX remediation, notifications) - related_conversation_id
    // is new: it needs to reach the persisted row (so a later GET
    // /notifications fetch can still route to the right conversation),
    // same as related_order_id already does.
    it("persists relatedConversationId on the notification row when given", async () => {
        notificationRepository.getUserContact.mockResolvedValue({ language: "en", email: null });
        resolveLocale.mockReturnValue("en");

        await notificationService.notify({
            userId: 1,
            type: "message",
            title: "New message",
            message: "hi",
            relatedConversationId: 42
        });

        expect(notificationRepository.create).toHaveBeenCalledWith(
            1, "message", "New message", "hi", undefined, 42
        );
    });
});

// Notification consolidation (Phase 3): AdminNotificationBell merged into
// the regular bell, per the Phase 1.2 decision. admin_notifications
// itself keeps the exact shared-inbox model migration 059 describes (one
// row per event, one read state shared by every admin) - only the read
// path changed to merge it in here for admin accounts. These tests cover
// that merge plus, explicitly, that the shared-state property survives
// it: marking a shared item read still goes through
// adminNotificationService (the single shared table), never a per-user
// copy.
describe("notification.service read/update operations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getMyNotifications", () => {
        it("returns only personal notifications, tagged, for a non-admin", async () => {
            notificationRepository.findByUser.mockResolvedValue([
                { id: 1, title: "Order shipped", created_at: "2026-01-02T00:00:00Z" }
            ]);

            const result = await notificationService.getMyNotifications(5, "buyer");

            expect(notificationRepository.findByUser).toHaveBeenCalledWith(5);
            expect(adminNotificationService.getRecent).not.toHaveBeenCalled();
            expect(result).toEqual([
                { id: "1", title: "Order shipped", created_at: "2026-01-02T00:00:00Z", source: "personal" }
            ]);
        });

        it("merges the shared admin feed in for an admin, newest first", async () => {
            notificationRepository.findByUser.mockResolvedValue([
                { id: 1, title: "Personal - older", created_at: "2026-01-01T00:00:00Z" }
            ]);
            adminNotificationService.getRecent.mockResolvedValue([
                { id: 1, title: "Shared - newer", created_at: "2026-01-03T00:00:00Z" }
            ]);

            const result = await notificationService.getMyNotifications(9, "admin");

            expect(adminNotificationService.getRecent).toHaveBeenCalledWith({ limit: 100 });
            expect(result.map((n) => n.id)).toEqual(["admin:1", "1"]);
            expect(result[0]).toMatchObject({ source: "admin", title: "Shared - newer" });
            expect(result[1]).toMatchObject({ source: "personal", title: "Personal - older" });
        });

        it("keeps a personal id and a shared id with the same numeric value distinct", async () => {
            notificationRepository.findByUser.mockResolvedValue([{ id: 7, created_at: "2026-01-01T00:00:00Z" }]);
            adminNotificationService.getRecent.mockResolvedValue([{ id: 7, created_at: "2026-01-01T00:00:00Z" }]);

            const result = await notificationService.getMyNotifications(9, "admin");
            const ids = result.map((n) => n.id);

            expect(ids).toContain("7");
            expect(ids).toContain("admin:7");
            expect(new Set(ids).size).toBe(2);
        });
    });

    describe("getUnreadCount", () => {
        it("returns only the personal count for a non-admin", async () => {
            notificationRepository.countUnread.mockResolvedValue(3);

            const result = await notificationService.getUnreadCount(1, "seller");

            expect(result).toBe(3);
            expect(adminNotificationService.getUnreadCount).not.toHaveBeenCalled();
        });

        it("adds the shared unread count for an admin", async () => {
            notificationRepository.countUnread.mockResolvedValue(3);
            adminNotificationService.getUnreadCount.mockResolvedValue(4);

            const result = await notificationService.getUnreadCount(1, "admin");

            expect(result).toBe(7);
        });
    });

    describe("markAsRead", () => {
        it("rejects when the personal notification doesn't exist", async () => {
            notificationRepository.findById.mockResolvedValue(undefined);
            await expect(notificationService.markAsRead(1, 5, "buyer")).rejects.toThrow("Notification not found");
        });

        it("rejects when the personal notification belongs to a different user", async () => {
            notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 99 });
            await expect(notificationService.markAsRead(1, 5, "buyer")).rejects.toMatchObject({
                code: "NOTIFICATION_NOT_FOUND",
                status: 404
            });
        });

        it("updates the personal notification when owned by the requesting user", async () => {
            notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 5 });
            await notificationService.markAsRead(1, 5, "buyer");
            expect(notificationRepository.markAsRead).toHaveBeenCalledWith(1);
        });

        it("routes an admin:-prefixed id to the SHARED table, not a personal copy", async () => {
            await notificationService.markAsRead("admin:42", 9, "admin");

            expect(adminNotificationService.markAsRead).toHaveBeenCalledWith("42", 9);
            expect(notificationRepository.findById).not.toHaveBeenCalled();
            expect(notificationRepository.markAsRead).not.toHaveBeenCalled();
        });

        it("404s an admin:-prefixed id from a non-admin role rather than reaching the shared table", async () => {
            await expect(notificationService.markAsRead("admin:42", 9, "buyer")).rejects.toMatchObject({
                code: "NOTIFICATION_NOT_FOUND",
                status: 404
            });
            expect(adminNotificationService.markAsRead).not.toHaveBeenCalled();
        });
    });

    describe("markAllAsRead - shared inbox behavior preserved", () => {
        it("only marks personal notifications read for a non-admin", async () => {
            await notificationService.markAllAsRead(5, "buyer");

            expect(notificationRepository.markAllAsRead).toHaveBeenCalledWith(5);
            expect(adminNotificationService.markAllAsRead).not.toHaveBeenCalled();
        });

        it("marks both personal AND the shared feed read for an admin", async () => {
            await notificationService.markAllAsRead(9, "admin");

            expect(notificationRepository.markAllAsRead).toHaveBeenCalledWith(9);
            // adminNotificationService.markAllAsRead operates on the single
            // shared admin_notifications table (WHERE is_read = 0, no
            // per-user scoping) - calling it at all is what clears the
            // shared feed for every admin, not just this one, exactly as
            // AdminNotificationBell's own "mark all read" used to.
            expect(adminNotificationService.markAllAsRead).toHaveBeenCalledWith(9);
        });
    });

    describe("deleteNotification", () => {
        it("rejects when not owned by the requesting user", async () => {
            notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 99 });
            await expect(notificationService.deleteNotification(1, 5)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
            expect(notificationRepository.remove).not.toHaveBeenCalled();
        });

        it("removes when owned by the requesting user", async () => {
            notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 5 });
            await notificationService.deleteNotification(1, 5);
            expect(notificationRepository.remove).toHaveBeenCalledWith(1);
        });

        it("refuses to delete a shared admin-sourced item individually", async () => {
            await expect(notificationService.deleteNotification("admin:1", 5)).rejects.toMatchObject({ status: 400 });
            expect(notificationRepository.findById).not.toHaveBeenCalled();
            expect(notificationRepository.remove).not.toHaveBeenCalled();
        });
    });
});
