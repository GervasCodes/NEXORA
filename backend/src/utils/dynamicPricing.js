// Phase 5 (Growth) - Dynamic Pricing. Takes a base price and a service's
// active pricing rules (migration 066's service_pricing_rules) and
// returns the effective price for one date.
//
// Priority, most to least specific - matches how
// service_availability.price (a manual per-date override) already
// always wins over anything computed here; this function is only ever
// called for a date that has NO manual override:
//   1. A date_range rule whose window contains the date (seasonal
//      pricing - "peak season is +30,000").
//   2. A day_of_week rule matching the date's weekday (recurring
//      pricing - "weekends are 20% more").
//   3. No matching rule - the base price, unchanged.
// If more than one rule of the same priority level matches (two
// overlapping date ranges, in practice a provider's own configuration
// error), the most recently created one wins - `rules` is expected
// already sorted newest-first by the caller's repository query.
function getDayOfWeek(dateStr) {
    // Date-only strings (YYYY-MM-DD) parse as UTC midnight, so getUTCDay
    // is the correct accessor here - using getDay() would shift the
    // weekday by one in negative-UTC-offset timezones.
    return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function applyAdjustment(basePrice, rule) {
    const adjusted = rule.adjustment_type === "percentage"
        ? basePrice * (1 + Number(rule.adjustment_value) / 100)
        : basePrice + Number(rule.adjustment_value);

    // A fixed-amount discount rule can't push the price below zero.
    return Math.max(0, adjusted);
}

function computeDynamicPrice(basePrice, rules, dateStr) {
    if (!rules || rules.length === 0) return basePrice;

    const dateRangeMatch = rules.find((rule) =>
        rule.rule_type === "date_range"
        && rule.is_active
        && dateStr >= rule.start_date
        && dateStr <= rule.end_date
    );

    if (dateRangeMatch) {
        return applyAdjustment(basePrice, dateRangeMatch);
    }

    const dayOfWeek = getDayOfWeek(dateStr);

    const dayOfWeekMatch = rules.find((rule) =>
        rule.rule_type === "day_of_week"
        && rule.is_active
        && rule.day_of_week === dayOfWeek
    );

    if (dayOfWeekMatch) {
        return applyAdjustment(basePrice, dayOfWeekMatch);
    }

    return basePrice;
}

module.exports = { computeDynamicPrice };
