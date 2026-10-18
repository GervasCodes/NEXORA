const trialRepository = require("./trial.repository");
const subscriptionRepository = require("./subscription.repository");
const notificationService = require("../notification/notification.service");
const auditService = require("../audit/audit.service");
const logger = require("../../utils/logger").child({ module: "trial" });
const { TRIAL_STAGE } = require("./trial.constants");

// The single place that answers "what can this seller use right now?".
//
//   inTrial        - the 7-day trial is running: every plan-gated feature
//                    (Analytics, AI insights, POS / business tools) is
//                    unlocked and nothing asks for payment.
//   trialEndsAt    - when the trial ends (null for non-sellers).
//   daysLeft       - whole days remaining, rounded up (0 once over).
//   paymentMode    - the trial is over (or never existed): gated features
//                    need a paid plan. Basic selling on the Free plan is
//                    never affected.
//   hasPaidPlan    - an entitled, non-free subscription exists.
//   hasGatedAccess - inTrial || hasPaidPlan; what the gate middleware uses.
//   trialUsed      - a trial was started at some point (no second trial).
exports.getAccessState = async (userId) => {
    const [trial, entitled] = await Promise.all([
        trialRepository.findTrialForUser(userId),
        subscriptionRepository.findEntitledForSeller(userId)
    ]);

    const inTrial = Boolean(trial && Number(trial.in_trial) === 1);
    const hasPaidPlan = Boolean(entitled)
        && (entitled.status === "active" || entitled.status === "past_due")
        && entitled.plan_code !== "free";

    return {
        inTrial,
        trialEndsAt: trial?.trial_ends_at || null,
        daysLeft: inTrial ? Number(trial.days_left) : 0,
        paymentMode: !inTrial,
        hasPaidPlan,
        hasGatedAccess: inTrial || hasPaidPlan,
        trialUsed: Boolean(trial?.trial_started_at),
        currentPlanCode: entitled ? entitled.plan_code : "free"
    };
};

// ---- Admin ------------------------------------------------------------------

exports.extendTrial = async ({ sellerId, days, adminId, reason }) => {
    const parsed = Math.floor(Number(days));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) {
        throw new Error("Extension must be between 1 and 90 days.");
    }

    const before = await trialRepository.findTrialForUser(sellerId);
    if (!before || before.role !== "seller") {
        throw new Error("Seller not found.");
    }

    const updated = await trialRepository.extendTrial(sellerId, parsed);
    if (!updated) throw new Error("Seller not found.");

    const after = await trialRepository.findTrialForUser(sellerId);

    auditService.log({
        userId: adminId,
        eventType: "seller_trial_extended",
        description: `Admin extended seller ${sellerId}'s trial by ${parsed} day(s)`,
        metadata: {
            seller_id: Number(sellerId),
            days: parsed,
            reason: reason || null,
            previous_trial_ends_at: before.trial_ends_at,
            new_trial_ends_at: after.trial_ends_at
        }
    });

    notificationService.notify({
        userId: Number(sellerId),
        type: "trial_extended",
        titleKey: "notifications.trial.extended.title",
        messageKey: "notifications.trial.extended.message",
        messageParams: { days: parsed }
    }).catch((err) => logger.warn({ err, sellerId }, "trial extended notify error"));

    return {
        sellerId: Number(sellerId),
        trialEndsAt: after.trial_ends_at,
        daysLeft: Number(after.days_left)
    };
};

// ---- Lifecycle (called from jobs/subscriptionLifecycle.job.js) ---------------

const send = (userId, stage, type) => {
    const base = `notifications.trial.${type}`;
    return notificationService.notify({
        userId,
        type: `trial_${type}`,
        titleKey: `${base}.title`,
        messageKey: `${base}.message`,
        withEmail: true
    }).catch((err) => logger.warn({ err, userId, stage }, "trial notify error"));
};

// Order matters: expired, then the last-day notice, then the day-5 notice.
// Claiming a later stage makes the earlier ones ineligible, so a seller
// whose reminders were missed by the job never gets several at once.
exports.sendLifecycleNotifications = async () => {
    let sent = 0;

    for (const row of await trialRepository.findExpired()) {
        if (!(await trialRepository.claimStage(row.user_id, TRIAL_STAGE.EXPIRED))) continue;
        await send(row.user_id, TRIAL_STAGE.EXPIRED, "expired");
        sent++;
    }
    for (const row of await trialRepository.findDueForDay7()) {
        if (!(await trialRepository.claimStage(row.user_id, TRIAL_STAGE.DAY_7))) continue;
        await send(row.user_id, TRIAL_STAGE.DAY_7, "lastDay");
        sent++;
    }
    for (const row of await trialRepository.findDueForDay5()) {
        if (!(await trialRepository.claimStage(row.user_id, TRIAL_STAGE.DAY_5))) continue;
        await send(row.user_id, TRIAL_STAGE.DAY_5, "midway");
        sent++;
    }

    return sent;
};
