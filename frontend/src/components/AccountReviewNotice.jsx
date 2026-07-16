// Shown in place of the seller/delivery dashboard while an account is
// pending, or has been rejected. Every seller/delivery-specific feature
// (products, orders, analytics, wallet, going online, claiming orders)
// stays hidden behind this until account_verification_status is
// "approved" - see SellerLayout.jsx / DeliveryLayout.jsx.
export default function AccountReviewNotice({ status, rejectionReason, roleLabel = "account" }) {
    if (status === "rejected") {
        return (
            <div className="glass-strong rounded-lg p-8 text-center">
                <p className="text-coral text-3xl mb-3">✕</p>
                <p className="font-display text-xl mb-2">Verification not approved</p>
                <p className="text-ash text-sm max-w-md mx-auto">
                    {rejectionReason
                        ? `Your ${roleLabel} verification was rejected: ${rejectionReason}.`
                        : `Your ${roleLabel} verification was not approved.`} Please contact
                    support for help resubmitting your documents.
                </p>
            </div>
        );
    }

    // "pending" is the expected default while under review. "not_required"
    // shouldn't normally happen for a seller/delivery account, but falls
    // back to the same pending copy rather than showing nothing.
    return (
        <div className="glass-strong rounded-lg p-8 text-center">
            <p className="text-mango text-3xl mb-3">⏳</p>
            <p className="font-display text-xl mb-2">Your account is under review</p>
            <p className="text-ash text-sm max-w-md mx-auto">
                Your account is currently under review. Our team is verifying your information.
                You will gain access to {roleLabel} features once verification is approved.
            </p>
        </div>
    );
}
