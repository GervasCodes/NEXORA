/**
 * Roadmap (Smarter Agent Ranking, Lightweight Pre-ML).
 *
 * A single, isolated scoring function - delivery.service.js's
 * rankCandidates calls scoreCandidate(agent) and sorts
 * descending by the number it returns; it never looks at what's inside
 * this file. That's deliberate: when a real trained ranking model
 * exists later, this file's internals get replaced (or scoreCandidate
 * starts calling out to that model) without rankCandidates
 * or any of its callers changing at all.
 *
 * Inputs expected on `agent` (all optional except distanceKm):
 *   - etaMinutesToSeller: road-routing ETA in minutes, or null if a
 *     routing lookup failed for this agent (see delivery.service.js).
 *   - acceptanceRate / completionRate: 0-1 ratios from
 *     delivery.repository.js#findAgentPerformanceStats, or null when
 *     the agent has no recorded history yet.
 */

// Weights - relative, not required to sum to 1. Not yet tuned against
// real production data; kept as named constants (mirroring
// ETA_CANDIDATE_POOL_SIZE in delivery.service.js) so they're easy to
// adjust later without hunting through the scoring math itself. ETA is
// weighted heaviest because it's the most directly time-sensitive
// factor (a buyer waiting on a shipped order cares most about "how
// fast can this get picked up"), with acceptance/completion history as
// meaningful but secondary tie-breakers among similarly-close agents.
const ETA_WEIGHT = 0.5;
const ACCEPTANCE_WEIGHT = 0.3;
const COMPLETION_WEIGHT = 0.2;

// An agent with no accept/decline history (delivery_offers) or no
// completed/failed delivery history yet - a brand-new agent, or one who
// just hasn't accumulated either kind of record - is scored as if
// "reasonably reliable" rather than penalized toward zero. Without this,
// a cold-start agent would be permanently ranked behind every agent with
// ANY history, including a genuinely unreliable one, which defeats the
// point of scoring by reliability at all.
const DEFAULT_RATE_FOR_NO_HISTORY = 0.75;

// A generous ceiling (minutes) for what "ETA" contributes to the score.
// Without a cap, one agent being 45 minutes away instead of 5 would
// swing etaScore across a huge range and drown out the
// acceptance/completion terms entirely; beyond this cap, further
// distance still hurts (etaScore floors at 0), just at a flatter,
// bounded rate.
const ETA_SCORE_CAP_MINUTES = 30;

// Phase 2: when the order's drop-off is known, how well the drop-off fits the
// agent also counts. Weights then sum to 1 with ETA still the biggest single
// factor; without a drop-off the original 0.5 / 0.3 / 0.2 weights apply, so
// orders without coordinates rank exactly as before.
const ETA_WEIGHT_WITH_DROPOFF = 0.4;
const DROPOFF_WEIGHT = 0.25;
const ACCEPTANCE_WEIGHT_WITH_DROPOFF = 0.2;
const COMPLETION_WEIGHT_WITH_DROPOFF = 0.15;

// Agents further than this from the drop-off get a proximity score of 0.
const DROPOFF_PROXIMITY_CAP_KM = 20;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

// 0-1 "how well does this job fit the agent's position", from three
// straight-line distances (km):
//   - efficiency = agentToDrop / (agentToPickup + pickupToDrop). It is 1 when
//     the shop lies on the way from the agent to the customer (no
//     backtracking) and falls as the trip doubles back on itself.
//   - proximity  = how close the agent already is to the customer.
// Both matter: the first rewards agents approaching from the right side, the
// second rewards agents already working the customer's area.
exports.dropoffFit = ({ agentToPickupKm, pickupToDropKm, agentToDropKm }) => {
    if ([agentToPickupKm, pickupToDropKm, agentToDropKm].some((v) => typeof v !== "number" || Number.isNaN(v))) {
        return null;
    }
    const tripKm = agentToPickupKm + pickupToDropKm;
    const efficiency = tripKm <= 0.05 ? 1 : clamp01(agentToDropKm / tripKm);
    const proximity = clamp01(1 - Math.min(agentToDropKm, DROPOFF_PROXIMITY_CAP_KM) / DROPOFF_PROXIMITY_CAP_KM);
    return (efficiency * 0.5) + (proximity * 0.5);
};

// Higher is better - this is the only contract the ranking code in
// delivery.service.js relies on.
exports.scoreCandidate = (agent) => {
    // An unknown ETA (routing lookup failed for this agent - see
    // rankCandidates's try/catch) is treated as "average
    // distance" (the cap) rather than best or worst, so a routing
    // hiccup doesn't unfairly bury or favor that agent.
    const etaMinutes = agent.etaMinutesToSeller ?? ETA_SCORE_CAP_MINUTES;
    const etaScore = Math.max(0, 1 - Math.min(etaMinutes, ETA_SCORE_CAP_MINUTES) / ETA_SCORE_CAP_MINUTES);

    const acceptanceRate = agent.acceptanceRate ?? DEFAULT_RATE_FOR_NO_HISTORY;
    const completionRate = agent.completionRate ?? DEFAULT_RATE_FOR_NO_HISTORY;

    if (agent.dropoffFit === null || agent.dropoffFit === undefined) {
        return (etaScore * ETA_WEIGHT) + (acceptanceRate * ACCEPTANCE_WEIGHT) + (completionRate * COMPLETION_WEIGHT);
    }

    return (etaScore * ETA_WEIGHT_WITH_DROPOFF)
        + (clamp01(agent.dropoffFit) * DROPOFF_WEIGHT)
        + (acceptanceRate * ACCEPTANCE_WEIGHT_WITH_DROPOFF)
        + (completionRate * COMPLETION_WEIGHT_WITH_DROPOFF);
};

// Exported for visibility/future tuning (e.g. an admin settings screen
// that adjusts these without a redeploy) - not currently read by
// anything outside this file.
exports.WEIGHTS = { ETA_WEIGHT, ACCEPTANCE_WEIGHT, COMPLETION_WEIGHT };
exports.WEIGHTS_WITH_DROPOFF = {
    ETA_WEIGHT: ETA_WEIGHT_WITH_DROPOFF,
    DROPOFF_WEIGHT,
    ACCEPTANCE_WEIGHT: ACCEPTANCE_WEIGHT_WITH_DROPOFF,
    COMPLETION_WEIGHT: COMPLETION_WEIGHT_WITH_DROPOFF
};
exports.DEFAULT_RATE_FOR_NO_HISTORY = DEFAULT_RATE_FOR_NO_HISTORY;
exports.ETA_SCORE_CAP_MINUTES = ETA_SCORE_CAP_MINUTES;
