const settingsService = require("../settings/settings.service");
const monetizationScheduleService = require("../monetizationSchedule/monetizationSchedule.service");

// Public (authenticated, not admin-only) monetization status - what the
// seller-facing billing banners (Trust & Monetization Communication
// roadmap section) read to show "Free during launch" vs
// "Billing starts on [date]" on the Subscription, Sponsorship, and
// Verification pages. Merges the flag on/off state with any pending
// scheduled activation for that same flag, so the banner can show a
// concrete date without the frontend needing two separate calls.
exports.getStatus = async (req, res) => {
    try {
        const [flags, pendingSchedule] = await Promise.all([
            settingsService.getPublicMonetizationStatus(),
            monetizationScheduleService.listPending()
        ]);

        for (const row of pendingSchedule) {
            if (flags[row.setting_key]) {
                flags[row.setting_key].scheduledAt = row.scheduled_at;
                flags[row.setting_key].scheduledValue = Boolean(row.scheduled_value);
            }
        }

        return res.json({ success: true, data: flags });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
