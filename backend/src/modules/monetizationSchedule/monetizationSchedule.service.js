const monetizationScheduleRepository = require("./monetizationSchedule.repository");
const settingsService = require("../settings/settings.service");
const auditService = require("../audit/audit.service");

// What the Admin Billing Control Center form is restricted to - the
// same four flags settings.service.js#updateMonetizationSettings
// enforces, so a schedule can never target an unrelated setting key.
const VALID_KEYS = monetizationScheduleRepository.VALID_KEYS;

exports.listPending = async () => monetizationScheduleRepository.listPending();

exports.schedule = async (settingKey, enabled, scheduledAt, adminId) => {
    if (!VALID_KEYS.includes(settingKey)) {
        throw new Error("Unknown monetization setting");
    }

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
        throw new Error("Invalid scheduled date/time");
    }
    if (when.getTime() <= Date.now()) {
        throw new Error("Scheduled time must be in the future");
    }

    const id = await monetizationScheduleRepository.create(settingKey, Boolean(enabled), when, adminId);

    auditService.log({
        userId: adminId,
        eventType: "monetization_schedule_created",
        description: `Admin scheduled ${settingKey} to be ${enabled ? "enabled" : "disabled"} at ${when.toISOString()}`,
        metadata: { setting_key: settingKey, scheduled_value: Boolean(enabled), scheduled_at: when.toISOString() }
    });

    return { id, settingKey, enabled: Boolean(enabled), scheduledAt: when };
};

exports.cancel = async (id, adminId) => {
    const row = await monetizationScheduleRepository.findById(id);
    if (!row) {
        throw new Error("Scheduled change not found");
    }
    if (row.applied_at) {
        throw new Error("This change has already been applied and can no longer be cancelled");
    }
    if (row.cancelled_at) {
        throw new Error("This scheduled change was already cancelled");
    }

    await monetizationScheduleRepository.cancel(id);

    auditService.log({
        userId: adminId,
        eventType: "monetization_schedule_cancelled",
        description: `Admin cancelled a scheduled change to ${row.setting_key}`,
        metadata: { setting_key: row.setting_key, schedule_id: id }
    });
};

// Admin-facing label for each flag - used in the push reminder copy
// below and mirrors the labels the frontend's AdminBillingControl.jsx
// and SellerBillingBanner.jsx show, so a seller sees the same wording
// in a push notification as they do on the page it's about.
const FLAG_LABELS = {
    monetization_subscriptions_enabled: "Subscriptions",
    monetization_commission_enabled: "Commission",
    monetization_sponsorship_enabled: "Sponsorship & featured placement",
    monetization_verification_fee_enabled: "Verification fee"
};

// Called every minute by jobs/monetizationSchedule.job.js, alongside
// applyDueSchedules() above - sends a push notification to every
// seller/provider 3 days and again 1 day before a scheduled billing
// change takes effect (Trust & Monetization Communication roadmap
// section). Idempotent per reminder point: findDueForReminder() only
// returns rows that haven't had that specific reminder sent yet, and
// markReminderSent() immediately excludes them from future ticks - see
// monetizationSchedule.repository.js.
//
// Push notification only - there's no SMS sending capability anywhere
// in this codebase yet (OTP delivery uses email via Brevo, not SMS; no
// SMS gateway is configured), so the roadmap's "SMS notifications"
// reminder channel isn't included here. See README-phase-7.md.
exports.sendDueReminders = async () => {
    const pushService = require("../push/push.service");
    let sentCount = 0;

    const reminderPoints = [
        { column: "reminder_3d_sent_at", hoursBefore: 72, humanLabel: "3 days" },
        { column: "reminder_1d_sent_at", hoursBefore: 24, humanLabel: "1 day" }
    ];

    for (const point of reminderPoints) {
        const due = await monetizationScheduleRepository.findDueForReminder(point.column, point.hoursBefore);

        for (const row of due) {
            const flagLabel = FLAG_LABELS[row.setting_key] || row.setting_key;
            const scheduledDate = new Date(row.scheduled_at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short"
            });
            const action = row.scheduled_value ? "starts billing for" : "turns off billing for";

            await pushService.sendToRoles(["seller"], {
                title: "Upcoming billing change",
                body: `In ${point.humanLabel}, NEXORA ${action} ${flagLabel} (${scheduledDate}).`,
                url: "/seller/subscription"
            });

            await monetizationScheduleRepository.markReminderSent(row.id, point.column);
            sentCount++;
        }
    }

    return sentCount;
};
exports.applyDueSchedules = async () => {
    const due = await monetizationScheduleRepository.findDue();

    for (const row of due) {
        await settingsService.updateMonetizationSettings(
            { [row.setting_key]: Boolean(row.scheduled_value) },
            null // system-applied, not a live admin action - audit entry has no acting user
        );
        await monetizationScheduleRepository.markApplied(row.id);
    }

    return due.length;
};
