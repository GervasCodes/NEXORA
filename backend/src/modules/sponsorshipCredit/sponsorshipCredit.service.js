const sponsorshipCreditRepository = require("./sponsorshipCredit.repository");
const settingsService = require("../settings/settings.service");

// One credit = one campaign-day, usable on any campaign type (product
// sponsorship, featured store, department sponsorship). Included credits
// are consumed first; whatever days they don't cover fall back to the
// existing paid a la carte flow, priced at that campaign type's own daily
// rate. This module owns that split so the three campaign services can't
// drift apart on it.

const MONTHS_PER_ANNUAL_PERIOD = 12;

// ---- Granting (called by subscription.service.js) -------------------------

// A plan's allotment is defined per month. A monthly billing cycle grants
// exactly that; an annual cycle covers twelve months in one period, so it
// grants twelve months' worth up front (nothing rolls over month to month
// inside it - the period is the unit that resets on renewal).
exports.computeGrantForPlan = (plan) => {
    const perMonth = Math.max(0, Number(plan.sponsorship_credits_per_month) || 0);
    return plan.billing_cycle === "annual" ? perMonth * MONTHS_PER_ANNUAL_PERIOD : perMonth;
};

// Grants one billing period's allotment. `subscription` must be the row
// as it stands AFTER activation (current_period_start/end set). Safe to
// call twice for the same subscription - the repository insert is
// idempotent, so a replayed activation never grants twice. A renewal or
// plan change is a new subscription row (see migration 073), so it lands
// here as a fresh grant; the previous period's unused credits simply stop
// being spendable (no rollover).
exports.grantForSubscription = async ({ subscription, plan }, executor) => {
    if (!subscription.current_period_start || !subscription.current_period_end) {
        throw new Error("Cannot grant sponsorship credits for a subscription without a billing period");
    }

    await sponsorshipCreditRepository.insertPeriodIfAbsent({
        sellerId: subscription.seller_id,
        subscriptionId: subscription.id,
        creditsGranted: exports.computeGrantForPlan(plan),
        periodStart: subscription.current_period_start,
        periodEnd: subscription.current_period_end
    }, executor);
};

// ---- Reading (seller-facing pricing context) ------------------------------

const remainingOf = (period) => Math.max(0, Number(period.credits_granted) - Number(period.credits_used));

exports.getSummary = async (sellerId) => {
    const periodId = await sponsorshipCreditRepository.findCurrentPeriodId(sellerId);
    const period = periodId ? await sponsorshipCreditRepository.findById(periodId) : null;

    if (!period) {
        return { granted: 0, used: 0, remaining: 0, period_end: null };
    }

    return {
        granted: Number(period.credits_granted),
        used: Number(period.credits_used),
        remaining: remainingOf(period),
        period_end: period.period_end
    };
};

// What every campaign type's getPricing() adds on top of its own daily
// rate: the seller's remaining included credits, and whether paid a la
// carte purchases are currently available at all.
exports.getPricingContext = async (sellerId) => {
    const [paidEnabled, includedCredits] = await Promise.all([
        settingsService.isSponsorshipMonetizationEnabled(),
        exports.getSummary(sellerId)
    ]);
    return { paid_enabled: paidEnabled, included_credits: includedCredits };
};

// ---- Funding a campaign (called inside the campaign services' txn) --------

const pluralDays = (n) => `${n} day${n === 1 ? "" : "s"}`;

// Pure. Included credits first, then paid for the remainder.
//
// paidEnabled is the Monetization Master Switch's sponsorship flag, now
// meaning "may a seller buy sponsorship a la carte at all". Credits are
// already paid for through the subscription, so they keep working with
// the flag off - it only blocks the paid remainder.
exports.splitFunding = ({ days, dailyRate, creditsAvailable, paidEnabled }) => {
    const available = Math.max(0, Number(creditsAvailable) || 0);
    const creditDays = Math.min(days, available);
    const paidDays = days - creditDays;

    if (paidDays > 0 && !paidEnabled) {
        if (available === 0) {
            throw new Error(
                "Paid sponsorship isn't available yet, and your plan has no included sponsorship credits left. Upgrade your subscription to get monthly credits."
            );
        }
        throw new Error(
            `Paid sponsorship isn't available yet, and you have ${pluralDays(available)} of included credits left. Choose ${pluralDays(available)} or fewer.`
        );
    }

    return {
        creditDays,
        paidDays,
        totalCost: paidDays > 0 ? Number((dailyRate * paidDays).toFixed(2)) : 0
    };
};

// Locks the seller's current credit period and works out how this
// campaign is funded. Does NOT consume anything - the caller checks the
// wallet against `totalCost` first and only then calls consumeCredits, so
// a campaign that can't be paid for never touches the allotment. Must run
// inside the caller's transaction, after it has locked the wallet (same
// lock order in all three campaign services).
exports.planFunding = async (sellerId, { days, dailyRate, paidEnabled }, connection) => {
    const periodId = await sponsorshipCreditRepository.findCurrentPeriodId(sellerId, connection);
    const period = periodId
        ? await sponsorshipCreditRepository.findByIdForUpdate(periodId, connection)
        : null;

    const funding = exports.splitFunding({
        days,
        dailyRate,
        creditsAvailable: period ? remainingOf(period) : 0,
        paidEnabled
    });

    return { ...funding, periodId: period ? period.id : null };
};

exports.consumeCredits = async (periodId, credits, connection) => {
    if (!credits || credits <= 0) return;

    const applied = await sponsorshipCreditRepository.incrementUsed(periodId, credits, connection);
    if (!applied) {
        throw new Error("Not enough included sponsorship credits remaining");
    }
};
