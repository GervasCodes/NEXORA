// (Honest Status Transparency): a single source of truth for
// "which of the 4 states is this order in" - payment pending, payment
// failed, paid + searching for a rider, paid + rider assigned/en route.
// Before this, each screen (TrackingWidget, OrderDetail, OrderTrackingPage)
// derived its own ad-hoc read of order/delivery fields, which is exactly
// how "payment succeeded" and "still looking for a rider" ended up
// blending into one ambiguous (and alarming) gap: a paid, shipped order
// with no delivery row yet (dispatch still searching - see
// delivery.service.js#offerToNextCandidate) rendered as a plain error
// page instead of a distinct, non-alarming state.
//
// `paymentFailed` is passed in rather than derived here because it isn't
// a persisted order field (orders.payment_status is only ever 'unpaid'/
// 'paid' - see database/schema/orders.sql) - it's a transient signal from
// a redirect/socket event the caller already tracks (see OrderDetail.jsx).

export const ORDER_STATE = {
    PAYMENT_PENDING: "payment_pending",
    PAYMENT_FAILED: "payment_failed",
    SEARCHING: "searching",
    ASSIGNED: "assigned",
    OTHER: "other" // processing pre-shipment, delivered, cancelled, etc. - each already has its own clear UI (OrderTimeline, rating card...), no banner needed.
};

export const getOrderState = (order, delivery, { paymentFailed = false } = {}) => {
    if (!order || order.status === "cancelled") return ORDER_STATE.OTHER;
    if (order.is_parent) return ORDER_STATE.OTHER;

    // An assigned delivery agent already implies the order is paid (the
    // backend never assigns dispatch to an unpaid order) - checked before
    // the payment gate below so a delivery record we already have is
    // always trusted over payment fields the order fetch may not have
    // populated (e.g. a stale/partial order shape mid-refresh).
    if (delivery?.agent_id) return ORDER_STATE.ASSIGNED;

    const isCod = order.payment_method === "cash_on_delivery";
    const isPaid = isCod || order.payment_status === "paid";

    if (!isPaid) {
        return paymentFailed ? ORDER_STATE.PAYMENT_FAILED : ORDER_STATE.PAYMENT_PENDING;
    }

    if (order.status === "shipped") return ORDER_STATE.SEARCHING;

    return ORDER_STATE.OTHER;
};

// Elapsed-time copy escalation for the SEARCHING state - the client-side
// half of the "whichever is simpler" choice in the phase brief. Used as
// the baseline (always correct even if a socket event is missed across a
// reconnect); the still_searching socket event handled by the caller can
// jump straight to "widened"/"exhausted" ahead of these thresholds.
export const SEARCH_STAGE = { LOOKING: "looking", WIDENING: "widening", TAKING_LONGER: "taking_longer" };

const WIDENING_AFTER_MS = 20_000;
const TAKING_LONGER_AFTER_MS = 75_000;

export const getSearchStageFromElapsed = (elapsedMs) => {
    if (elapsedMs >= TAKING_LONGER_AFTER_MS) return SEARCH_STAGE.TAKING_LONGER;
    if (elapsedMs >= WIDENING_AFTER_MS) return SEARCH_STAGE.WIDENING;
    return SEARCH_STAGE.LOOKING;
};
