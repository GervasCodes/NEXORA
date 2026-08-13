jest.mock("../../../src/modules/adminNotification/adminNotification.repository");
jest.mock("../../../src/modules/push/push.service");
jest.mock("../../../src/socket/socket");
jest.mock("../../../src/config/sentry", () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn()
}));

const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
    child: jest.fn(() => ({ error: mockLoggerError, warn: mockLoggerWarn, info: jest.fn(), debug: jest.fn() }))
}));

const adminNotificationRepository = require("../../../src/modules/adminNotification/adminNotification.repository");
const pushService = require("../../../src/modules/push/push.service");
const socket = require("../../../src/socket/socket");
const Sentry = require("../../../src/config/sentry");

const adminNotificationService = require("../../../src/modules/adminNotification/adminNotification.service");

beforeEach(() => {
    pushService.sendToAdmins.mockResolvedValue(undefined);
});

// notify() is fire-and-forget (same reasoning as audit.service.js#log) -
// it doesn't return a promise, so every assertion here has to wait a tick
// for the swallowed .then()/.catch() chain to actually run.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("adminNotification.service.notify", () => {
    it("creates the notification row and doesn't return a promise", async () => {
        adminNotificationRepository.create.mockResolvedValue(55);

        const result = adminNotificationService.notify({
            type: "account_suspended",
            category: "account",
            severity: "warning",
            title: "Account suspended",
            message: "Jane Doe (jane@b.com) was suspended. Reason: fraud",
            metadata: { target_user_id: 7 },
            relatedUserId: 7
        });

        expect(result).toBeUndefined();
        await flush();

        expect(adminNotificationRepository.create).toHaveBeenCalledWith({
            type: "account_suspended",
            category: "account",
            severity: "warning",
            title: "Account suspended",
            message: "Jane Doe (jane@b.com) was suspended. Reason: fraud",
            metadata: { target_user_id: 7 },
            relatedUserId: 7
        });
    });

    it("fans the new notification out to every connected admin over the socket", async () => {
        adminNotificationRepository.create.mockResolvedValue(55);

        adminNotificationService.notify({
            type: "account_suspended",
            category: "account",
            severity: "warning",
            title: "Account suspended",
            message: "Jane Doe was suspended",
            relatedUserId: 7
        });
        await flush();

        expect(socket.emitToAdmins).toHaveBeenCalledWith(
            "admin_notification:new",
            expect.objectContaining({
                id: 55,
                type: "account_suspended",
                category: "account",
                severity: "warning",
                title: "Account suspended",
                message: "Jane Doe was suspended",
                related_user_id: 7,
                is_read: false
            })
        );
    });

    it("defaults severity to 'info' in both the socket payload and the web-push payload when none is given", async () => {
        adminNotificationRepository.create.mockResolvedValue(56);

        adminNotificationService.notify({
            type: "user_account_deleted",
            category: "account",
            title: "Account self-deleted",
            message: "Someone deleted their account"
        });
        await flush();

        expect(socket.emitToAdmins).toHaveBeenCalledWith(
            "admin_notification:new",
            expect.objectContaining({ severity: "info" })
        );
        expect(pushService.sendToAdmins).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "info" })
        );
    });

    it("also sends a web push to every subscribed admin", async () => {
        adminNotificationRepository.create.mockResolvedValue(57);

        adminNotificationService.notify({
            type: "account_permanently_deleted",
            category: "account",
            severity: "critical",
            title: "Account permanently deleted",
            message: "An account was permanently deleted"
        });
        await flush();

        expect(pushService.sendToAdmins).toHaveBeenCalledWith({
            title: "Account permanently deleted",
            body: "An account was permanently deleted",
            type: "account_permanently_deleted",
            category: "account",
            severity: "critical"
        });
    });

    it("never throws if the socket layer is unavailable, and still sends the push notification", async () => {
        adminNotificationRepository.create.mockResolvedValue(58);
        socket.emitToAdmins.mockImplementation(() => { throw new Error("socket down"); });

        expect(() => adminNotificationService.notify({
            type: "account_suspended", category: "account", title: "t", message: "m"
        })).not.toThrow();
        await flush();

        expect(pushService.sendToAdmins).toHaveBeenCalled();
    });

    it("logs and reports to Sentry (rather than throwing) if the notification insert itself fails", async () => {
        adminNotificationRepository.create.mockRejectedValue(new Error("db exploded"));

        adminNotificationService.notify({ type: "account_suspended", category: "account", title: "t", message: "m" });
        await flush();

        expect(mockLoggerError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "account_suspended", err: expect.any(Error) }),
            "failed to record admin notification"
        );
        expect(Sentry.captureException).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ tags: { area: "adminNotification" }, extra: { type: "account_suspended" } })
        );
    });

    it("logs a warning (rather than throwing) if the web push send fails after the row was created", async () => {
        adminNotificationRepository.create.mockResolvedValue(59);
        pushService.sendToAdmins.mockRejectedValue(new Error("push provider down"));

        adminNotificationService.notify({ type: "account_suspended", category: "account", title: "t", message: "m" });
        await flush();

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            expect.objectContaining({ type: "account_suspended", err: expect.any(Error) }),
            "push send error (adminNotify)"
        );
    });
});

describe("adminNotification.service read operations", () => {
    it("getRecent delegates its filters to the repository", async () => {
        adminNotificationRepository.findRecent.mockResolvedValue([{ id: 1 }]);

        const result = await adminNotificationService.getRecent({ category: "account", unreadOnly: true, limit: 10 });

        expect(adminNotificationRepository.findRecent).toHaveBeenCalledWith({
            category: "account", unreadOnly: true, limit: 10
        });
        expect(result).toEqual([{ id: 1 }]);
    });

    it("getUnreadCount delegates to the repository", async () => {
        adminNotificationRepository.countUnread.mockResolvedValue(3);
        await expect(adminNotificationService.getUnreadCount()).resolves.toBe(3);
    });

    it("markAsRead rejects when the notification doesn't exist", async () => {
        adminNotificationRepository.findById.mockResolvedValue(undefined);
        await expect(adminNotificationService.markAsRead(1, 5)).rejects.toMatchObject({ status: 404 });
        expect(adminNotificationRepository.markAsRead).not.toHaveBeenCalled();
    });

    it("markAsRead marks it read by the acting admin when it exists", async () => {
        adminNotificationRepository.findById.mockResolvedValue({ id: 1 });
        await adminNotificationService.markAsRead(1, 5);
        expect(adminNotificationRepository.markAsRead).toHaveBeenCalledWith(1, 5);
    });

    it("markAllAsRead delegates to the repository with the acting admin's id", async () => {
        await adminNotificationService.markAllAsRead(5);
        expect(adminNotificationRepository.markAllAsRead).toHaveBeenCalledWith(5);
    });
});
