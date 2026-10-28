const orderRepository = require("../modules/order/order.repository");
const notificationService = require("../modules/notification/notification.service");
const adminNotificationService = require("../modules/adminNotification/adminNotification.service");
const logger = require("../utils/logger").child({ module: "job:preorderReminders" });
const Sentry = require("../config/sentry");
const { todayInTz, addDaysInTz } = require("../utils/dateTz");

// Phase 2: made-to-order items can take days or weeks, and nothing used to
// watch the clock. This sweep (hourly) does two things for orders still
// "awaiting_ready":
//   - the day before preorder_ready_by, reminds the seller once;
//   - once preorder_ready_by has passed, tells the seller and the admins
//     once (so late orders get noticed), and tells the buyer it's running
//     late.
// Both are one-shot per order (ready_reminder_sent_at / overdue_notified_at),
// so re-running the job never spams anyone. Dates are compared as
// Africa/Dar_es_Salaam calendar days.
const toDateString = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    // mysql2 returns DATE columns as Date objects at local midnight.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

exports.run = async (now = new Date()) => {
    const today = todayInTz(now);
    const tomorrow = addDaysInTz(1, now);
    const rows = await orderRepository.findPreordersAwaitingReady();

    let reminded = 0;
    let overdue = 0;

    for (const row of rows) {
        const readyBy = toDateString(row.preorder_ready_by);
        if (!readyBy) continue;

        try {
            if (readyBy < today && !row.overdue_notified_at) {
                await orderRepository.markOverdueNotified(row.id);
                overdue += 1;

                if (row.seller_id) {
                    await notificationService.notify({
                        userId: row.seller_id,
                        type: "preorder_overdue",
                        titleKey: "notifications.order.preorderOverdueSeller.title",
                        messageKey: "notifications.order.preorderOverdueSeller.message",
                        messageParams: { orderNumber: row.order_number },
                        relatedOrderId: row.id,
                        withEmail: true
                    });
                }
                await notificationService.notify({
                    userId: row.buyer_id,
                    type: "preorder_overdue",
                    titleKey: "notifications.order.preorderOverdueBuyer.title",
                    messageKey: "notifications.order.preorderOverdueBuyer.message",
                    messageParams: { orderNumber: row.order_number },
                    relatedOrderId: row.id,
                    withEmail: true
                });
                adminNotificationService.notify({
                    type: "preorder_overdue",
                    category: "moderation",
                    severity: "warning",
                    title: "Made-to-order item is late",
                    message: `Order ${row.order_number} passed its ready-by date (${readyBy}) and the seller has not marked it ready.`,
                    metadata: { orderId: row.id, sellerId: row.seller_id, readyBy }
                });
            } else if (readyBy === tomorrow && !row.ready_reminder_sent_at && row.seller_id) {
                await orderRepository.markReadyReminderSent(row.id);
                reminded += 1;
                await notificationService.notify({
                    userId: row.seller_id,
                    type: "preorder_due_soon",
                    titleKey: "notifications.order.preorderDueSoon.title",
                    messageKey: "notifications.order.preorderDueSoon.message",
                    messageParams: { orderNumber: row.order_number, readyBy },
                    relatedOrderId: row.id,
                    withEmail: true
                });
            }
        } catch (error) {
            logger.error({ err: error, orderId: row.id }, "failed to send made-to-order reminder");
            Sentry.captureException(error, { tags: { area: "job:preorderReminders" }, extra: { orderId: row.id } });
        }
    }

    if (reminded || overdue) {
        logger.info({ reminded, overdue }, "made-to-order reminders sent");
    }
};
