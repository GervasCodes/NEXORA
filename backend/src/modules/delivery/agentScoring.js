/**
 * Roadmap Phase 2 (Smarter Agent Ranking, Lightweight Pre-ML).
 *
 * A single, isolated scoring function - delivery.service.js's
 * rankCandidatesBySellerEta calls scoreCandidate(agent) and sorts
 * descending by the number it returns; it never looks at what's inside
 * this file. That's deliberate: when a real trained ranking model
 * exists later, this file's internals get replaced (or scoreCandidate
 * starts calling out to that model) without rankCandidatesBySellerEta
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

// Higher is better - this is the only contract rankCandidatesBySellerEta
// relies on.
exports.scoreCandidate = (agent) => {
    // An unknown ETA (routing lookup failed for this agent - see
    // rankCandidatesBySellerEta's try/catch) is treated as "average
    // distance" (the cap) rather than best or worst, so a routing
    // hiccup doesn't unfairly bury or favor that agent.
    const etaMinutes = agent.etaMinutesToSeller ?? ETA_SCORE_CAP_MINUTES;
    const etaScore = Math.max(0, 1 - Math.min(etaMinutes, ETA_SCORE_CAP_MINUTES) / ETA_SCORE_CAP_MINUTES);

    const acceptanceRate = agent.acceptanceRate ?? DEFAULT_RATE_FOR_NO_HISTORY;
    const completionRate = agent.completionRate ?? DEFAULT_RATE_FOR_NO_HISTORY;

    return (etaScore * ETA_WEIGHT) + (acceptanceRate * ACCEPTANCE_WEIGHT) + (completionRate * COMPLETION_WEIGHT);
};

// Exported for visibility/future tuning (e.g. an admin settings screen
// that adjusts these without a redeploy) - not currently read by
// anything outside this file.
exports.WEIGHTS = { ETA_WEIGHT, ACCEPTANCE_WEIGHT, COMPLETION_WEIGHT };
exports.DEFAULT_RATE_FOR_NO_HISTORY = DEFAULT_RATE_FOR_NO_HISTORY;
exports.ETA_SCORE_CAP_MINUTES = ETA_SCORE_CAP_MINUTES;
