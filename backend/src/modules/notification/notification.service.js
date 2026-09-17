const notificationRepository = require("./notification.repository");
const adminNotificationService = require("../adminNotification/adminNotification.service");
const logger = require("../../utils/logger").child({ module: "notification" });
const sendEmail = require("../../utils/sendEmail");
const pushService = require("../push/push.service");
const { t, resolveLocale } = require("../../i18n");

// Notification consolidation (Phase 3, per the Phase 1.2 decision):
// AdminNotificationBell was merged into the regular NotificationBell on
// the frontend, so this module - not adminNotification.controller.js's
// own routes - is now the single read path both a buyer/seller AND an
// admin hit for "my notifications". admin_notifications itself is
// UNCHANGED: still one shared table/feed with one shared read state (see
// migration 059's rationale for why it was never fanned out per-admin),
// still written to via adminNotificationService.notify() from every
// existing call site. Only how it's *read* changes - merged in here
// alongside the personal `notifications` table for admin users.
//
// The two tables both use their own AUTO_INCREMENT id, so a plain
// personal id (42) and a shared admin id (42) can collide. Personal ids
// are left exactly as they've always been (plain numbers - no other
// client of `notifications` should have to change), and an admin-sourced
// item is tagged with an `admin:` string prefix instead. markAsRead/
// deleteNotification below dispatch on that prefix.
const ADMIN_ID_PREFIX = "admin:";
const isAdminNotificationId = (id) => typeof id === "string" && id.startsWith(ADMIN_ID_PREFIX);
const stripAdminPrefix = (id) => id.slice(ADMIN_ID_PREFIX.length);

// Reusable helper: other modules (order, payment, delivery, dispute,
// wallet, seller, admin, accountVerification) call this directly to
// raise a notification.
//
// Callers pass translation keys (titleKey/messageKey, resolved against
// backend/src/i18n/locales) plus the params to interpolate into them,
// rather than pre-built English strings - that way every notification
// (and its optional email) is rendered in the RECIPIENT's own saved
// language, not the language of whoever/whatever triggered it.
//
// `title`/`message` (plain, already-built strings) are still accepted
// as a fallback for any call site not yet migrated to keys, so this
// never silently drops a notification.
// A messageParams/titleParams value can be a plain value (interpolated
// as-is) or a `{ key, params }` object naming another translation to
// resolve first - used for dynamic labels (e.g. a dispute's type or
// resolution) and optional trailing fragments (e.g. "{noteSuffix}",
// which is either "" or a translated " Note: ..." clause) that a
// caller can't otherwise localize itself before it knows the
// recipient's locale.
const resolveParams = (locale, params) => {
    if (!params) return params;
    const resolved = {};
    for (const [k, v] of Object.entries(params)) {
        resolved[k] = v && typeof v === "object" && v.key ? t(locale, v.key, v.params) : v;
    }
    return resolved;
};

// Notification preferences (UI/UX remediation) - which
// notify() `type` values fall under each of the four buyer-toggleable
// categories (see migration 100's comment on why these four and no
// others). Any type NOT listed here is never gated by preference at
// all - account/security/financial/fraud/KYC/admin/compliance
// notifications always fire, on purpose.
const CATEGORY_BY_TYPE = {
    notify_order_updates: [
        "order_placed", "order_cancelled", "order_status_update",
        "delivery_assigned", "delivery_update",
        "return_requested", "return_status", "return", "dispute",
        "booking_created", "booking_confirmed", "booking_cancelled",
        "booking_rejected", "booking_rescheduled", "booking_payment",
        "group_buy_resolved"
    ],
    notify_messages: ["message"],
    notify_price_stock_alerts: ["product_back_in_stock", "product_price_drop"],
    notify_store_updates: ["store_new_listing", "live_selling_started"]
};

const TYPE_TO_PREFERENCE_COLUMN = Object.entries(CATEGORY_BY_TYPE).reduce((map, [column, types]) => {
    types.forEach((type) => { map[type] = column; });
    return map;
}, {});

// Returns false only when the type is one of the four gated categories
// AND the user has explicitly turned that category off - every other
// type (including any not yet added to CATEGORY_BY_TYPE above) is
// allowed through, so this fails open rather than silently swallowing
// a notification type nobody thought to categorize.
const isAllowedByPreference = (type, contact) => {
    const column = TYPE_TO_PREFERENCE_COLUMN[type];
    if (!column) return true;
    return contact?.[column] !== 0;
};

exports.notify = async ({
    userId,
    type,
    titleKey,
    titleParams,
    messageKey,
    messageParams,
    title,
    message,
    relatedOrderId,
    relatedConversationId,
    withEmail,
    withWhatsApp,
    url
}) => {
    const contact = await notificationRepository.getUserContact(userId);

    if (!isAllowedByPreference(type, contact)) {
        return;
    }

    const locale = resolveLocale(contact?.language);

    const resolvedTitle = titleKey ? t(locale, titleKey, resolveParams(locale, titleParams)) : title;
    const resolvedMessage = messageKey ? t(locale, messageKey, resolveParams(locale, messageParams)) : message;

    const notificationId = await notificationRepository.create(
        userId,
        type,
        resolvedTitle,
        resolvedMessage,
        relatedOrderId,
        relatedConversationId
    );

    // Real-time fan-out. Every existing call site across the app (orders,
    // disputes, wallet, sponsorship, delivery, account, accountVerification,
    // etc.) goes through this one function, so wiring it here makes ALL of
    // them live instead of touching each module individually.
    //
    // Lazy require avoids a circular dependency: socket.js requires
    // chat.service.js at the top of the file, and chat.service.js now
    // requires this module (to notify the other participant on a new
    // message) - a top-level require here would resolve to socket.js's
    // still-empty exports object mid-load.
    const resolvedUrl = url || (relatedOrderId ? `/orders/${relatedOrderId}` : undefined);
    try {
        const socket = require("../../socket/socket");
        socket.emitToUser(userId, "notification:new", {
            id: notificationId,
            type,
            title: resolvedTitle,
            message: resolvedMessage,
            related_order_id: relatedOrderId || null,
            related_conversation_id: relatedConversationId || null,
            is_read: false,
            created_at: new Date(),
            url: resolvedUrl
        });
    } catch (error) {
        // Socket layer being unavailable should never break notification creation
    }

    // Web push - reaches a device even if no tab is open/focused (that's
    // the whole point of push vs. the socket event above, which only
    // reaches an already-connected tab). Best-effort; sendToUser never
    // throws, but this is wrapped anyway since it's not on the critical path.
    pushService
        .sendToUser(userId, {
            title: resolvedTitle,
            body: resolvedMessage,
            type,
            notificationId,
            orderId: relatedOrderId || undefined,
            url: resolvedUrl
        })
        .catch((error) => logger.warn({ err: error }, "push send error (notify)"));

    if (withEmail && contact?.email) {
        const body = `${resolvedMessage}\n\n${t(locale, "email.footer")}`;
        await sendEmail(contact.email, resolvedTitle, body);
    }

    // opt-in only (contact.whatsapp_order_updates), and only
    // when the caller explicitly asked for this leg (withWhatsApp) -
    // most notify() call sites are things a WhatsApp message would be
    // noise for (a chat reply, a wishlist price drop), so this is never
    // on by default the way the in-app notification itself is.
    if (withWhatsApp && contact?.whatsapp_order_updates && contact?.phone) {
        const whatsappProvider = require("../whatsapp/providers/whatsapp.provider");
        whatsappProvider.sendText(contact.phone, `${resolvedTitle}\n${resolvedMessage}`)
            .catch((error) => logger.warn({ err: error }, "whatsapp send error (notify)"));
    }
};

exports.getMyNotifications = async (userId, role) => {
    const personal = (await notificationRepository.findByUser(userId)).map((n) => ({
        ...n,
        id: String(n.id),
        source: "personal"
    }));

    if (role !== "admin") return personal;

    // Merged in, not paginated together: the shared feed keeps its own
    // 100-row cap (adminNotificationService.getRecent's default, same as
    // findByUser's own LIMIT 100) rather than the two competing for one
    // combined limit - an admin with a very active personal history
    // shouldn't crowd out the shared team feed, or vice versa.
    const shared = (await adminNotificationService.getRecent({ limit: 100 })).map((n) => ({
        ...n,
        id: `${ADMIN_ID_PREFIX}${n.id}`,
        source: "admin"
    }));

    return [...personal, ...shared].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
};

exports.getUnreadCount = async (userId, role) => {
    const personalUnread = await notificationRepository.countUnread(userId);
    if (role !== "admin") return personalUnread;

    const sharedUnread = await adminNotificationService.getUnreadCount();
    return personalUnread + sharedUnread;
};

exports.markAsRead = async (notificationId, userId, role) => {
    if (isAdminNotificationId(notificationId)) {
        // The route itself is admin-gated (authorize("admin")) same as
        // every other /notifications endpoint an admin account can hit,
        // but role is re-checked here too so a stale/forged admin: id on
        // a non-admin session 404s instead of silently reaching into the
        // shared feed's mark-as-read.
        if (role !== "admin") {
            throw Object.assign(new Error("Notification not found"), { code: "NOTIFICATION_NOT_FOUND", status: 404 });
        }
        return adminNotificationService.markAsRead(stripAdminPrefix(notificationId), userId);
    }

    const notification = await notificationRepository.findById(notificationId);

    if (!notification || notification.user_id !== userId) {
        throw Object.assign(new Error("Notification not found"), { code: "NOTIFICATION_NOT_FOUND", status: 404 });
    }

    await notificationRepository.markAsRead(notificationId);
};

exports.markAllAsRead = async (userId, role) => {
    await notificationRepository.markAllAsRead(userId);

    // Shared feed is genuinely shared - "mark all read" from any one
    // admin's bell clears it for every admin, same as it always did
    // behind AdminNotificationBell.jsx's own "mark all" button.
    if (role === "admin") {
        await adminNotificationService.markAllAsRead(userId);
    }
};

exports.deleteNotification = async (notificationId, userId) => {
    if (isAdminNotificationId(notificationId)) {
        // Shared items were never individually deletable (there's no
        // per-admin copy to delete - deleting it would remove it from
        // every admin's feed at once), so this stays a clear 400 rather
        // than quietly no-op'ing or, worse, actually deleting the row.
        throw Object.assign(
            new Error("Shared admin notifications can't be deleted individually"),
            { status: 400 }
        );
    }

    const notification = await notificationRepository.findById(notificationId);

    if (!notification || notification.user_id !== userId) {
        throw Object.assign(new Error("Notification not found"), { code: "NOTIFICATION_NOT_FOUND", status: 404 });
    }

    await notificationRepository.remove(notificationId);
};
