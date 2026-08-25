import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatMoney, formatDate } from "../../utils/format";
import EmptyState from "../../components/ui/EmptyState";

const STATUS_STYLES = {
    active: "bg-mango/20 text-mango-dark",
    repaid: "bg-teal text-white",
    defaulted: "bg-coral/10 text-coral"
};

export default function SellerLoans() {
    const [eligibility, setEligibility] = useState(null);
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);

    const [amount, setAmount] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const load = () => {
        Promise.all([
            api.get("/loans/eligibility").then(({ data }) => data.data),
            api.get("/loans").then(({ data }) => data.data)
        ]).then(([eligibilityData, loansData]) => {
            setEligibility(eligibilityData);
            setLoans(loansData);
        }).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        setMessage("");
        try {
            await api.post("/loans", { amount: Number(amount) });
            setMessage("Advance disbursed to your wallet balance.");
            setAmount("");
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Working capital" noIndex />
            <h1 className="font-display text-2xl mb-1">Working capital advance</h1>
            <p className="text-ash text-sm mb-8">
                Borrow against your pending (held) balance. A flat {(eligibility.feeRate * 100).toFixed(0)}% fee applies, repaid automatically as your held balance releases.
            </p>

            <div className="border border-line rounded-lg p-6 mb-8">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Held balance</p>
                <p className="font-display text-2xl mb-1">{formatMoney(eligibility.heldBalance)}</p>
                <p className="text-sm text-ash">Available to borrow: {formatMoney(eligibility.maxAdvance)}</p>
            </div>

            {eligibility.activeLoan ? (
                <div className="border border-line rounded-lg p-4 mb-8 text-sm">
                    <p className="font-medium mb-1">Active advance</p>
                    <p className="text-ash">
                        Repaid {formatMoney(eligibility.activeLoan.amount_repaid)} of {formatMoney(eligibility.activeLoan.total_repayable)}
                    </p>
                </div>
            ) : eligibility.eligible ? (
                <form onSubmit={submit} className="space-y-4 mb-10">
                    <div>
                        <label htmlFor="loan-amount" className="block text-sm mb-1">Amount to borrow</label>
                        <input
                            id="loan-amount"
                            type="number"
                            min={eligibility.minAmount}
                            max={eligibility.maxAdvance}
                            required
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>

                    {message && <p className="text-sm text-teal">{message}</p>}
                    {error && <p className="text-sm text-coral">{error}</p>}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? "Requesting…" : "Get advance"}
                    </button>
                </form>
            ) : (
                <p className="text-ash text-sm mb-8">{eligibility.ineligibleReason}</p>
            )}

            <h2 className="font-display text-lg mb-3">Advance history</h2>
            {loans.length === 0 ? (
                <EmptyState title="No advances yet." />
            ) : (
                <ul className="space-y-2">
                    {loans.map((loan) => (
                        <li key={loan.id} className="flex items-start justify-between text-sm border-b border-line pb-2">
                            <span>
                                <span className="block">
                                    {formatMoney(loan.principal_amount)} advance (fee {formatMoney(loan.fee_amount)})
                                </span>
                                <span className="text-ash text-xs">
                                    Repaid {formatMoney(loan.amount_repaid)} of {formatMoney(loan.total_repayable)} · {formatDate(loan.disbursed_at)}
                                </span>
                            </span>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[loan.status] || "bg-line text-ash"}`}>
                                {loan.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
