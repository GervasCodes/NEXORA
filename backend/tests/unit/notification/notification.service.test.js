jest.mock("../../../src/modules/notification/notification.repository");
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
            5
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

        expect(notificationRepository.create).toHaveBeenCalledWith(1, "custom", "Plain title", "Plain message", undefined);
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
});

describe("notification.service read/update operations", () => {
    it("getMyNotifications delegates to the repository", async () => {
        notificationRepository.findByUser.mockResolvedValue([{ id: 1 }]);
        const result = await notificationService.getMyNotifications(1);
        expect(notificationRepository.findByUser).toHaveBeenCalledWith(1);
        expect(result).toEqual([{ id: 1 }]);
    });

    it("getUnreadCount delegates to the repository", async () => {
        notificationRepository.countUnread.mockResolvedValue(3);
        const result = await notificationService.getUnreadCount(1);
        expect(result).toBe(3);
    });

    it("markAsRead rejects when the notification doesn't exist", async () => {
        notificationRepository.findById.mockResolvedValue(undefined);
        await expect(notificationService.markAsRead(1, 5)).rejects.toThrow("Notification not found");
    });

    it("markAsRead rejects when the notification belongs to a different user", async () => {
        notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 99 });
        await expect(notificationService.markAsRead(1, 5)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND", status: 404 });
    });

    it("markAsRead updates when owned by the requesting user", async () => {
        notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 5 });
        await notificationService.markAsRead(1, 5);
        expect(notificationRepository.markAsRead).toHaveBeenCalledWith(1);
    });

    it("markAllAsRead delegates to the repository", async () => {
        await notificationService.markAllAsRead(5);
        expect(notificationRepository.markAllAsRead).toHaveBeenCalledWith(5);
    });

    it("deleteNotification rejects when not owned by the requesting user", async () => {
        notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 99 });
        await expect(notificationService.deleteNotification(1, 5)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
        expect(notificationRepository.remove).not.toHaveBeenCalled();
    });

    it("deleteNotification removes when owned by the requesting user", async () => {
        notificationRepository.findById.mockResolvedValue({ id: 1, user_id: 5 });
        await notificationService.deleteNotification(1, 5);
        expect(notificationRepository.remove).toHaveBeenCalledWith(1);
    });
});
