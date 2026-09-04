const notificationRepository = require("./notification.repository");
const logger = require("../../utils/logger").child({ module: "notification" });
const sendEmail = require("../../utils/sendEmail");
const pushService = require("../push/push.service");
const { t, resolveLocale } = require("../../i18n");

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

// Notification preferences (Phase 10, UI/UX remediation) - which
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
        relatedOrderId
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

    // Phase Q3: opt-in only (contact.whatsapp_order_updates), and only
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

exports.getMyNotifications = async (userId) => {
    return notificationRepository.findByUser(userId);
};

exports.getUnreadCount = async (userId) => {
    return notificationRepository.countUnread(userId);
};

exports.markAsRead = async (notificationId, userId) => {
    const notification = await notificationRepository.findById(notificationId);

    if (!notification || notification.user_id !== userId) {
        throw Object.assign(new Error("Notification not found"), { code: "NOTIFICATION_NOT_FOUND", status: 404 });
    }

    await notificationRepository.markAsRead(notificationId);
};

exports.markAllAsRead = async (userId) => {
    await notificationRepository.markAllAsRead(userId);
};

exports.deleteNotification = async (notificationId, userId) => {
    const notification = await notificationRepository.findById(notificationId);

    if (!notification || notification.user_id !== userId) {
        throw Object.assign(new Error("Notification not found"), { code: "NOTIFICATION_NOT_FOUND", status: 404 });
    }

    await notificationRepository.remove(notificationId);
};
