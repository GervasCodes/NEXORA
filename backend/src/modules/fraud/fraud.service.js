const fraudRepository = require("./fraud.repository");
const adminNotificationService = require("../adminNotification/adminNotification.service");

// Deliberately simple, explainable rules rather than a model - each one
// should be something an admin reviewing a flag can immediately
// understand ("why was this flagged?") without needing to trust a black
// box. Thresholds are conservative on purpose: false positives cost an
// admin a few seconds reviewing and dismissing a flag, but a rule that's
// too aggressive trains admins to ignore this feature entirely.

const HIGH_VALUE_FIRST_ORDER_THRESHOLD = 1_000_000; // TZS
const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_ORDER_COUNT = 3;
const WITHDRAWAL_OUTLIER_MULTIPLIER = 4;
const MIN_WITHDRAWAL_HISTORY_FOR_OUTLIER_CHECK = 2;

// Called after an order is created (order.service.checkout). Deliberately
// fire-and-forget from the caller's side - a flagging failure should
// never block checkout.
exports.evaluateOrder = async (order) => {
    const { priorOrderCount } = await fraudRepository.getBuyerPriorOrderStats(order.buyer_id);
    // priorOrderCount includes the order just created, since it's already
    // been inserted by the time this runs - so "1" means this IS their
    // first order.
    const isFirstOrder = priorOrderCount <= 1;

    if (isFirstOrder && Number(order.total_amount) >= HIGH_VALUE_FIRST_ORDER_THRESHOLD) {
        await flagOnce("order", order.id, "high_value_first_order",
            `First-ever order from this buyer is unusually large (${Math.round(order.total_amount).toLocaleString()} TZS).`,
            "medium");
    }

    const recentCount = await fraudRepository.countRecentOrdersByBuyer(order.buyer_id, VELOCITY_WINDOW_MINUTES);
    if (recentCount >= VELOCITY_ORDER_COUNT) {
        await flagOnce("order", order.id, "order_velocity",
            `This buyer placed ${recentCount} orders within ${VELOCITY_WINDOW_MINUTES} minutes.`,
            "medium");
    }
};

// Called after a withdrawal request is created (wallet.service.requestWithdrawal).
exports.evaluateWithdrawal = async (sellerId, amount) => {
    const { priorCount, avgAmount } = await fraudRepository.getSellerPriorWithdrawalStats(sellerId);

    if (priorCount < MIN_WITHDRAWAL_HISTORY_FOR_OUTLIER_CHECK || avgAmount <= 0) {
        return; // Not enough history yet to know what "normal" looks like for this seller.
    }

    if (Number(amount) >= avgAmount * WITHDRAWAL_OUTLIER_MULTIPLIER) {
        await flagOnce("seller", sellerId, "withdrawal_outlier",
            `Withdrawal request (${Math.round(amount).toLocaleString()} TZS) is over ${WITHDRAWAL_OUTLIER_MULTIPLIER}x this seller's usual amount (avg ${Math.round(avgAmount).toLocaleString()} TZS).`,
            "high");
    }
};

async function flagOnce(entityType, entityId, ruleCode, reason, severity) {
    const alreadyFlagged = await fraudRepository.hasOpenFlag(entityType, entityId, ruleCode);
    if (alreadyFlagged) return;
    await fraudRepository.createFlag({ entityType, entityId, ruleCode, reason, severity });

    // "Important security/system events" (Phase 2 event list) - a new
    // fraud flag is exactly that. Every flag already lands in the Fraud
    // Review queue (admin.controller.js#listFraudFlags) regardless of
    // severity; this additionally surfaces it in the notification
    // center so it isn't only found by an admin who happens to check
    // that page.
    adminNotificationService.notify({
        type: "fraud_flag_raised",
        category: "security",
        severity: severity === "high" ? "critical" : "warning",
        title: "Fraud flag raised",
        message: reason,
        metadata: { entity_type: entityType, entity_id: entityId, rule_code: ruleCode, fraud_severity: severity },
        relatedUserId: entityType === "seller" ? entityId : null
    });
}

exports.listOpenFlags = async () => fraudRepository.findOpen();

exports.resolveFlag = async (id, status, adminId) => {
    if (!["dismissed", "confirmed"].includes(status)) {
        throw new Error("Invalid resolution status");
    }
    await fraudRepository.resolve(id, status, adminId);
};

// --- Dashboard / anomaly detection (Phase Q9 - Admin Tools) ---
// Same philosophy as the rules above: plain, checkable statistics over
// fraud_flags, computed fresh on every request - not a trained model,
// nothing persisted. "Anomaly" means "this day's flag count sits more
// standard deviations above its own trailing baseline than normal
// day-to-day noise would explain", using the platform's own history as
// the only reference point.

const TREND_WINDOW_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;
const DAILY_ANOMALY_STDDEV_MULTIPLIER = 2;
// Guards against a quiet baseline (e.g. a new platform averaging under
// one flag/day) making any single ordinary day look "anomalous" just
// because the stddev is tiny - a day needs to clear this absolute floor
// too, not just the statistical one.
const DAILY_ANOMALY_MIN_COUNT = 3;
const RULE_SPIKE_MULTIPLIER = 2;
const RULE_SPIKE_MIN_RECENT_COUNT = 3;

function averageOf(nums) {
    return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}

function stddevOf(nums, avg) {
    if (nums.length < 2) return 0;
    const variance = nums.reduce((sum, n) => sum + (n - avg) ** 2, 0) / nums.length;
    return Math.sqrt(variance);
}

// fraud.repository#getDailyFlagCounts only returns days that had at
// least one flag - this fills every day in the window with 0 so the
// trend chart and the baseline math both see a real, continuous series.
function buildDailySeries(rawCounts, days) {
    const byDay = new Map(rawCounts.map((r) => [r.day, r.count]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        series.push({ day: key, count: byDay.get(key) || 0 });
    }
    return series;
}

exports.getDashboardStats = async () => {
    const [rawDaily, ruleRecent, ruleTrend, severityBreakdown, resolutionBreakdown, topFlaggedEntities] = await Promise.all([
        fraudRepository.getDailyFlagCounts(TREND_WINDOW_DAYS),
        fraudRepository.getRuleBreakdown(RECENT_WINDOW_DAYS),
        fraudRepository.getRuleBreakdown(TREND_WINDOW_DAYS),
        fraudRepository.getOpenSeverityBreakdown(),
        fraudRepository.getResolutionBreakdown(TREND_WINDOW_DAYS),
        fraudRepository.getTopFlaggedEntities(8)
    ]);

    const dailySeries = buildDailySeries(rawDaily, TREND_WINDOW_DAYS);
    const baselineDays = dailySeries.slice(0, dailySeries.length - RECENT_WINDOW_DAYS);
    const recentDays = dailySeries.slice(dailySeries.length - RECENT_WINDOW_DAYS);

    const baselineCounts = baselineDays.map((d) => d.count);
    const baselineAvg = averageOf(baselineCounts);
    const baselineStddev = stddevOf(baselineCounts, baselineAvg);
    const dailyThreshold = baselineAvg + DAILY_ANOMALY_STDDEV_MULTIPLIER * baselineStddev;

    const daily = dailySeries.map((d) => {
        const inRecentWindow = recentDays.some((r) => r.day === d.day);
        const isAnomaly = inRecentWindow && d.count >= DAILY_ANOMALY_MIN_COUNT && d.count > dailyThreshold;
        return { ...d, isAnomaly };
    });

    const anomalyDays = daily.filter((d) => d.isAnomaly).map((d) => ({
        day: d.day,
        count: d.count,
        reason: `${d.count} flags raised on ${d.day} - above the past month's typical rate of about ${baselineAvg.toFixed(1)}/day.`
    }));

    const last7DayCount = recentDays.reduce((sum, d) => sum + d.count, 0);
    const baselineWeeklyAvg = baselineAvg * RECENT_WINDOW_DAYS;
    const percentChangeVsBaseline = baselineWeeklyAvg > 0
        ? Math.round(((last7DayCount - baselineWeeklyAvg) / baselineWeeklyAvg) * 100)
        : (last7DayCount > 0 ? 100 : 0);

    // Per-rule spike check: this rule's last-7-day count vs its own
    // trailing baseline (the 30-day count minus the recent 7, scaled
    // back down to a 7-day rate so the comparison is apples-to-apples).
    const ruleTrendByCode = new Map(ruleTrend.map((r) => [r.ruleCode, r]));
    const baselineWindowDays = TREND_WINDOW_DAYS - RECENT_WINDOW_DAYS;
    const ruleBreakdown = ruleRecent.map((recent) => {
        const trend = ruleTrendByCode.get(recent.ruleCode) || { count: recent.count, highCount: recent.highCount };
        const baselineCount = Math.max(0, trend.count - recent.count);
        const baselineWeeklyRate = (baselineCount / baselineWindowDays) * RECENT_WINDOW_DAYS;
        const isSpike = recent.count >= RULE_SPIKE_MIN_RECENT_COUNT
            && recent.count > baselineWeeklyRate * RULE_SPIKE_MULTIPLIER;
        return {
            ruleCode: recent.ruleCode,
            recentCount: recent.count,
            recentHighCount: recent.highCount,
            baselineWeeklyRate: Math.round(baselineWeeklyRate * 10) / 10,
            isSpike
        };
    }).sort((a, b) => b.recentCount - a.recentCount);

    const openTotal = severityBreakdown.reduce((sum, s) => sum + s.count, 0);
    const confirmed = resolutionBreakdown.find((r) => r.status === "confirmed")?.count || 0;
    const dismissed = resolutionBreakdown.find((r) => r.status === "dismissed")?.count || 0;
    const resolvedTotal = confirmed + dismissed;

    return {
        dailySeries: daily,
        anomalyDays,
        summary: {
            openTotal,
            last7DayCount,
            baselineWeeklyAvg: Math.round(baselineWeeklyAvg * 10) / 10,
            percentChangeVsBaseline,
            confirmedCount: confirmed,
            dismissedCount: dismissed,
            confirmedRate: resolvedTotal > 0 ? Math.round((confirmed / resolvedTotal) * 100) : null
        },
        severityBreakdown,
        ruleBreakdown,
        topFlaggedEntities
    };
};
