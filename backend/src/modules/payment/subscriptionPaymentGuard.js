// Guard against a second subscription payment while one is still open.
//
// A pending payment blocks a new one for PENDING_TIMEOUT_MINUTES. After that
// the old attempt is marked failed (only if it is still pending), so a seller
// is never locked out by a payment the provider never confirmed. If the old
// attempt later succeeds, the webhook still handles it: claimCompleted treats
// a failed-then-paid payment as a late success, and the normal review and
// refund path applies. The reconciliation job compares provider status with
// our status and flags any mismatch for review, so nothing is applied
// silently.
//
// Chosen timeout: 30 minutes. Mobile-money prompts expire well inside that,
// and card and PayPal checkout sessions are closed after roughly 30 minutes.
const PENDING_TIMEOUT_MINUTES = 30;

exports.PENDING_TIMEOUT_MINUTES = PENDING_TIMEOUT_MINUTES;

exports.assertNoLivePendingSubscriptionPayment = async ({ paymentRepository, subscriptionId }) => {
    const timedOut = await paymentRepository.expireStalePendingForSubscription(
        subscriptionId, PENDING_TIMEOUT_MINUTES
    );

    const latest = await paymentRepository.findLatestBySubscriptionId(subscriptionId);
    if (latest && latest.status === "pending") {
        throw new Error("A payment for this plan is already awaiting confirmation. Check your phone or your payment page, or try again in a few minutes.");
    }

    return { timedOut };
};
