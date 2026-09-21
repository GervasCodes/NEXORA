// Mirrors backend sponsorshipCredit.service.js#splitFunding for the live
// cost preview on the three campaign forms: 1 credit = 1 campaign-day,
// included credits are spent first, and only the remaining days are paid
// for at the campaign type's daily rate. The backend recomputes all of it
// under a row lock when the campaign is actually created - this is
// display-only, never the source of truth.
export function computeFunding(pricing, days) {
    const parsedDays = Math.max(0, Math.floor(Number(days) || 0));
    const remaining = Math.max(0, Number(pricing?.included_credits?.remaining) || 0);
    const dailyRate = Number(pricing?.daily_rate) || 0;

    const creditDays = Math.min(parsedDays, remaining);
    const paidDays = parsedDays - creditDays;

    return {
        creditDays,
        paidDays,
        totalCost: paidDays > 0 ? Number((dailyRate * paidDays).toFixed(2)) : 0,
        remainingCredits: remaining,
        // Paid a la carte purchases switched off (Monetization Master
        // Switch): the campaign can only run if credits cover every day.
        blocked: paidDays > 0 && !pricing?.paid_enabled
    };
}
