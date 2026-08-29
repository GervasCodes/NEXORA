const deliveryRepository = require("../modules/delivery/delivery.repository");
const pushService = require("../modules/push/push.service");
const whatsappProvider = require("../modules/whatsapp/providers/whatsapp.provider");
const logger = require("../utils/logger").child({ module: "job:supplyNudge" });
const Sentry = require("../config/sentry");

// Roadmap Phase 3 (Supply-Side Incentive Nudges) - deliberately just a
// notification mechanism, NOT a full surge-pricing engine (explicitly
// out of scope per the roadmap doc). Kept as plain constants here rather
// than admin-editable settings.service.js rows, matching the roadmap's
// "keep the threshold as a simple configurable constant/setting for
// now" instruction - easy to retune (or later promote into a real
// setting) without the admin-UI/validation surface that would add.

// Ratio of "typical orders this hour" to "agents currently online"
// above which coverage is considered thin enough to nudge. E.g. a
// value of 1.5 means "if history says this hour usually sees more than
// 1.5 orders per currently-online agent, that's thin coverage" - not
// tuned against real production data yet.
const LOW_COVERAGE_ORDERS_PER_AGENT_THRESHOLD = 1.5;

// How many days of history to average this hour-of-day bucket's typical
// order volume over. 28 days = 4 full weeks, so weekday/weekend demand
// patterns for this specific hour both get represented rather than
// skewed by whichever days happen to fall in a shorter window. Caveat:
// on a platform younger than this, the average is diluted by days
// before it had any real order volume at all, understating true demand
// early on - self-correcting as more history accumulates, and in
// keeping with this being a lightweight pre-surge-pricing signal, not a
// precise model (see Roadmap Phase 2's agentScoring.js for the same
// "simple now, swappable later" posture).
const HISTORY_WINDOW_DAYS = 28;

// Compares recent order volume against currently-online agent count,
// per rough time-of-day bucket (the current hour), and - if online
// coverage looks thin relative to what this hour typically needs -
// nudges offline-but-eligible agents to come online. Runs on a
// schedule (see jobs/index.js) rather than only reacting after an
// order is already stuck, unlike deliveryRematch.job.js's reactive
// sweep.
exports.run = async () => {
    const [orderCount, onlineAgentCount] = await Promise.all([
        deliveryRepository.countOrdersInCurrentHourBucket(HISTORY_WINDOW_DAYS),
        deliveryRepository.countOnlineAgents()
    ]);

    const avgOrdersThisHour = orderCount / HISTORY_WINDOW_DAYS;

    // No typical demand for this hour at all (a quiet overnight slot, or
    // a brand-new platform with no history yet) - nothing to nudge
    // agents online FOR, regardless of how few are online right now.
    if (avgOrdersThisHour <= 0) return;

    const isLowCoverage = onlineAgentCount === 0
        || (avgOrdersThisHour / onlineAgentCount) > LOW_COVERAGE_ORDERS_PER_AGENT_THRESHOLD;

    if (!isLowCoverage) return;

    const eligibleAgents = await deliveryRepository.findOfflineEligibleAgents();
    if (eligibleAgents.length === 0) return;

    logger.info(
        { avgOrdersThisHour, onlineAgentCount, nudged: eligibleAgents.length },
        "thin agent coverage detected for this hour - nudging offline agents to go online"
    );

    const title = "Demand is high right now";
    const body = "Orders are picking up and there aren't many riders online - go online to earn more.";

    for (const agent of eligibleAgents) {
        try {
            await pushService.sendToUser(agent.id, { title, body });
        } catch (error) {
            logger.warn({ err: error, agentId: agent.id }, "push send error (supply nudge)");
            Sentry.captureException(error, { tags: { area: "job:supplyNudge" }, extra: { agentId: agent.id } });
        }

        // Best effort, fire-and-forget - same posture as the offer send
        // in delivery.service.js#offerToNextCandidate. Only attempted
        // when WhatsApp is actually configured (Roadmap Phase 1); no
        // SMS fallback here since a "go online" nudge (unlike an offer)
        // isn't time-critical enough to justify the per-message SMS
        // cost for every offline agent on every low-coverage tick.
        if (agent.phone && whatsappProvider.isConfigured()) {
            whatsappProvider
                .sendText(agent.phone, `${title} - ${body}`)
                .catch((error) => logger.warn({ err: error, agentId: agent.id }, "whatsapp send error (supply nudge)"));
        }
    }
};
