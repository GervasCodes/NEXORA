import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { formatMoney } from "../utils/format";

// Shown in place of a seller feature (currently just Analytics) when the
// one-time verification fee hasn't been paid yet. Reaching this at all
// means the account is already approved - see
// requireVerificationFeePaid.middleware.js on the API side and
// SellerLayout, which handles the earlier "account not yet approved"
// gate before any of this is ever rendered.
//
// Offers all three payment options the platform supports for this fee
// (mobile money, Snippe, PayPal) - the old standalone Seller
// Verification page only offered mobile money; the other two existed on
// the backend since Phase 2 but had no frontend surface until now.
export default function VerificationFeeGate({ requiredFee, onPaid, returnPath }) {
    const [phone, setPhone] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(null); // "mobile_money" | "snippe" | "paypal" | null
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
    const pollRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => () => clearInterval(pollRef.current), []);

    // Handles landing back here after Snippe/PayPal - same pattern as
    // OrderDetail.jsx's checkout return handling.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const payment = params.get("payment");
        if (!payment) return;

        const cleanUrl = () => navigate(returnPath, { replace: true });

        if (payment === "paypal_return") {
            const paypalOrderId = params.get("token");
            if (!paypalOrderId) {
                cleanUrl();
                return;
            }
            api.post("/payments/paypal/capture", { paypalOrderId })
                .then(() => {
                    setMessage("Payment successful.");
                    onPaid?.();
                })
                .catch((err) => setError(extractErrorMessage(err)))
                .finally(cleanUrl);

        } else if (payment === "success") {
            setMessage("Payment successful.");
            onPaid?.();
            cleanUrl();

        } else if (payment === "cancelled") {
            setError("Payment was cancelled - you can try again below.");
            cleanUrl();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pollForConfirmation = () => {
        let attempts = 0;
        clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            attempts += 1;
            try {
                const { data } = await api.get("/seller/profile");
                if (data.data?.verification_fee_paid) {
                    clearInterval(pollRef.current);
                    setAwaitingConfirmation(false);
                    setMessage("Verification fee confirmed.");
                    onPaid?.();
                    return;
                }
            } catch {
                // keep polling - a transient failure here shouldn't stop it
            }

            if (attempts >= 30) {
                clearInterval(pollRef.current);
                setAwaitingConfirmation(false);
                setMessage("");
                setError("We haven't received confirmation yet. If you completed the payment on your phone, this page will update automatically once it's confirmed - you can also refresh later.");
            }
        }, 4000);
    };

    const payWithMobileMoney = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setBusy("mobile_money");
        try {
            const { data } = await api.post("/seller/verification/fee", { phone });
            setMessage(data.message || "Check your phone to complete the payment.");
            setAwaitingConfirmation(true);
            pollForConfirmation();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(null);
        }
    };

    const payWithSnippe = async () => {
        setError("");
        setBusy("snippe");
        try {
            const origin = window.location.origin;
            const { data } = await api.post("/payments/verification-fee/snippe/checkout", {
                successUrl: `${origin}${returnPath}?payment=success`,
                cancelUrl: `${origin}${returnPath}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(null);
        }
    };

    const payWithPaypal = async () => {
        setError("");
        setBusy("paypal");
        try {
            const origin = window.location.origin;
            const { data } = await api.post("/payments/verification-fee/paypal/create", {
                returnUrl: `${origin}${returnPath}?payment=paypal_return`,
                cancelUrl: `${origin}${returnPath}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(null);
        }
    };

    return (
        <div className="max-w-md glass-strong rounded-lg p-5">
            <h2 className="font-display text-lg mb-1">Pay the verification fee</h2>
            <p className="text-sm text-ash mb-4">
                A one-time fee of {formatMoney(requiredFee)} unlocks Analytics and the paid Verified Seller badge.
            </p>

            {error && <p role="alert" className="text-coral text-sm mb-3">{error}</p>}
            {message && <p className="text-teal text-sm mb-3">{message}</p>}

            {awaitingConfirmation && (
                <p className="text-sm text-azure-deep bg-azure/10 rounded-md px-3 py-2 flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-azure-deep animate-pulse shrink-0" />
                    Waiting for payment confirmation on your phone…
                </p>
            )}

            <form onSubmit={payWithMobileMoney} className="space-y-3 mb-4">
                <div>
                    <label className="block text-sm mb-1">Mobile money phone number</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} required
                        disabled={awaitingConfirmation}
                        placeholder="e.g. 0712345678"
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring disabled:opacity-60" />
                </div>
                <button type="submit" disabled={busy === "mobile_money" || awaitingConfirmation}
                    className="w-full bg-mango text-abyss px-4 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-60">
                    {busy === "mobile_money" ? "Sending prompt…" : awaitingConfirmation ? "Awaiting confirmation…" : `Pay ${formatMoney(requiredFee)} via mobile money`}
                </button>
            </form>

            <div className="flex items-center gap-2 text-xs text-ash mb-4">
                <span className="flex-1 h-px bg-line" /> or <span className="flex-1 h-px bg-line" />
            </div>

            <div className="space-y-2">
                <button type="button" onClick={payWithSnippe} disabled={busy === "snippe" || awaitingConfirmation}
                    className="w-full border border-line px-4 py-2 rounded-md text-sm font-semibold hover:border-ink transition-colors disabled:opacity-60">
                    {busy === "snippe" ? "Redirecting…" : "Pay with card (Snippe)"}
                </button>
                <button type="button" onClick={payWithPaypal} disabled={busy === "paypal" || awaitingConfirmation}
                    className="w-full border border-line px-4 py-2 rounded-md text-sm font-semibold hover:border-ink transition-colors disabled:opacity-60">
                    {busy === "paypal" ? "Redirecting…" : "Pay with PayPal"}
                </button>
            </div>
        </div>
    );
}
