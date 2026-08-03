import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";

export default function SellerSubscription() {
    const [plans, setPlans] = useState([]);
    const [current, setCurrent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const [selectedPlan, setSelectedPlan] = useState(null);
    const [phone, setPhone] = useState("");
    const [busy, setBusy] = useState(null);
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
    const pollRef = useRef(null);

    const navigate = useNavigate();
    const location = useLocation();
    const returnPath = "/seller/subscription";

    const load = () => {
        setLoading(true);
        Promise.all([api.get("/subscriptions/plans"), api.get("/subscriptions/me")])
            .then(([plansRes, meRes]) => {
                setPlans(plansRes.data.data);
                setCurrent(meRes.data.data);
            })
            .catch(() => setError("Couldn't load subscription plans."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);
    useEffect(() => () => clearInterval(pollRef.current), []);

    // Handles landing back here after Snippe/PayPal - mirrors
    // VerificationFeeGate.jsx's own return-URL handling.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const payment = params.get("payment");
        if (!payment) return;

        const cleanUrl = () => navigate(returnPath, { replace: true });

        if (payment === "paypal_return") {
            const paypalOrderId = params.get("token");
            if (!paypalOrderId) { cleanUrl(); return; }
            api.post("/payments/paypal/capture", { paypalOrderId })
                .then(() => { setMessage("Payment successful - your plan is now active."); load(); })
                .catch((err) => setError(extractErrorMessage(err)))
                .finally(cleanUrl);
        } else if (payment === "success") {
            setMessage("Payment successful - your plan is now active.");
            load();
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
                const { data } = await api.get("/subscriptions/me");
                if (data.data?.status === "active" && data.data?.plan?.code === selectedPlan?.code) {
                    clearInterval(pollRef.current);
                    setAwaitingConfirmation(false);
                    setMessage("Payment confirmed - your plan is now active.");
                    setCurrent(data.data);
                    return;
                }
            } catch {
                // keep polling
            }
            if (attempts >= 30) {
                clearInterval(pollRef.current);
                setAwaitingConfirmation(false);
                setError("We haven't received confirmation yet. If you completed the payment on your phone, this page will update automatically once it's confirmed.");
            }
        }, 4000);
    };

    const payWithMobileMoney = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setBusy("mobile_money");
        try {
            const { data } = await api.post("/subscriptions/subscribe", { planCode: selectedPlan.code, phone });
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
            const { data } = await api.post("/subscriptions/subscribe/snippe", {
                planCode: selectedPlan.code,
                successUrl: `${origin}${returnPath}?payment=success`,
                cancelUrl: `${origin}${returnPath}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(null);
        }
    };

    // MalipoPay Card equivalent of payWithSnippe above.
    const payWithMalipopayCard = async () => {
        setError("");
        setBusy("malipopay_card");
        try {
            const origin = window.location.origin;
            const { data } = await api.post("/subscriptions/subscribe/malipopay-card", {
                planCode: selectedPlan.code,
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
            const { data } = await api.post("/subscriptions/subscribe/paypal", {
                planCode: selectedPlan.code,
                returnUrl: `${origin}${returnPath}?payment=paypal_return`,
                cancelUrl: `${origin}${returnPath}?payment=cancelled`
            });
            window.location.href = data.data.url;
        } catch (err) {
            setError(extractErrorMessage(err));
            setBusy(null);
        }
    };

    const cancelAutoRenew = async () => {
        setError("");
        setMessage("");
        try {
            const { data } = await api.post("/subscriptions/cancel");
            setMessage(data.message);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    if (loading) return <PageLoader />;

    const currentPlanCode = current?.plan?.code || "free";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-display text-2xl mb-1">Subscription</h1>
                <p className="text-sm text-ash">
                    Choose a plan to lower your commission rate and raise your active listing limit.
                </p>
            </div>

            {error && <p role="alert" className="text-coral text-sm">{error}</p>}
            {message && <p className="text-teal text-sm">{message}</p>}

            {current && (
                <div className="glass-strong rounded-lg p-4">
                    <p className="text-sm text-ash mb-1">Current plan</p>
                    <p className="font-display text-lg mb-1">{current.plan.name}</p>
                    <p className="text-sm text-ash">
                        {current.listingCount} active listing{current.listingCount === 1 ? "" : "s"}
                        {current.plan.maxActiveListings ? ` of ${current.plan.maxActiveListings} allowed` : " (unlimited)"}
                    </p>
                    {current.currentPeriodEnd && (
                        <p className="text-sm text-ash mt-1">
                            {current.autoRenew ? "Renews" : "Ends"} {formatDate(current.currentPeriodEnd)}
                        </p>
                    )}
                    {!current.isFreePlan && current.status === "active" && current.autoRenew && (
                        <button onClick={cancelAutoRenew} className="text-sm text-coral hover:underline mt-2">
                            Turn off auto-renew
                        </button>
                    )}
                </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan) => (
                    <div key={plan.code} className={`glass-strong rounded-lg p-4 flex flex-col ${plan.code === currentPlanCode ? "border-2 border-mango" : ""}`}>
                        <p className="font-display text-lg mb-1">{plan.name}</p>
                        <p className="text-2xl font-semibold price mb-1">
                            {plan.price > 0 ? formatMoney(plan.price) : "Free"}
                            {plan.price > 0 && <span className="text-sm text-ash font-normal">/{plan.billingCycle === "annual" ? "yr" : "mo"}</span>}
                        </p>
                        {plan.description && <p className="text-sm text-ash mb-3">{plan.description}</p>}
                        <ul className="text-sm text-ash space-y-1 mb-4 flex-1">
                            {(plan.features || []).map((f, i) => <li key={i}>• {f}</li>)}
                        </ul>
                        {plan.code === currentPlanCode ? (
                            <span className="text-center text-sm font-semibold text-mango py-2">Current plan</span>
                        ) : plan.price === 0 ? (
                            <span className="text-center text-sm text-ash py-2">Default plan</span>
                        ) : (
                            <button
                                onClick={() => { setSelectedPlan(plan); setError(""); setMessage(""); }}
                                className="w-full bg-mango text-abyss px-4 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors"
                            >
                                Choose {plan.name}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {selectedPlan && (
                <div className="max-w-md glass-strong rounded-lg p-5">
                    <h2 className="font-display text-lg mb-1">Subscribe to {selectedPlan.name}</h2>
                    <p className="text-sm text-ash mb-4">
                        {formatMoney(selectedPlan.price)} per {selectedPlan.billingCycle === "annual" ? "year" : "month"}
                    </p>

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
                            {busy === "mobile_money" ? "Sending prompt…" : awaitingConfirmation ? "Awaiting confirmation…" : `Pay ${formatMoney(selectedPlan.price)} via mobile money`}
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
                        <button type="button" onClick={payWithMalipopayCard} disabled={busy === "malipopay_card" || awaitingConfirmation}
                            className="w-full border border-line px-4 py-2 rounded-md text-sm font-semibold hover:border-ink transition-colors disabled:opacity-60">
                            {busy === "malipopay_card" ? "Redirecting…" : "Pay with card (MalipoPay)"}
                        </button>
                        <button type="button" onClick={payWithPaypal} disabled={busy === "paypal" || awaitingConfirmation}
                            className="w-full border border-line px-4 py-2 rounded-md text-sm font-semibold hover:border-ink transition-colors disabled:opacity-60">
                            {busy === "paypal" ? "Redirecting…" : "Pay with PayPal"}
                        </button>
                    </div>

                    <button onClick={() => setSelectedPlan(null)} className="w-full text-center text-sm text-ash hover:underline mt-3">
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
