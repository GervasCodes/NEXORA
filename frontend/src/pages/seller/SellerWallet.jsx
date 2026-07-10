import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const WITHDRAWAL_STATUS_STYLES = {
    pending: "bg-mango/20 text-mango-dark",
    approved: "bg-teal/10 text-teal",
    paid: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral"
};

export default function SellerWallet() {
    const [wallet, setWallet] = useState(null);
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showForm, setShowForm] = useState(false);
    const [amount, setAmount] = useState("");
    const [payoutMethod, setPayoutMethod] = useState("mobile_money");
    const [payoutDetails, setPayoutDetails] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const load = () => {
        setLoading(true);
        Promise.all([
            api.get("/wallet"),
            api.get("/wallet/withdrawals")
        ])
            .then(([w, wd]) => {
                setWallet(w.data.data);
                setWithdrawals(wd.data.data);
            })
            .catch(() => setError("Couldn't load your wallet."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submitWithdrawal = async (e) => {
        e.preventDefault();
        setFormError("");
        setSubmitting(true);

        try {
            await api.post("/wallet/withdrawals", {
                amount: Number(amount),
                payout_method: payoutMethod,
                payout_details: payoutDetails
            });
            setAmount("");
            setPayoutDetails("");
            setShowForm(false);
            load();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <p className="text-ash">Loading your wallet…</p>;
    if (error) return <p className="text-coral text-sm">{error}</p>;
    if (!wallet) return null;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Wallet</h1>
            <p className="text-ash text-sm mb-8">Your earnings after platform commission, ready to withdraw.</p>

            <div className="border border-line rounded-lg p-6 mb-8 flex items-center justify-between flex-wrap gap-4">
                <div>
                    <p className="text-xs text-ash mb-1">Available balance</p>
                    <p className="price text-3xl font-medium">{formatMoney(wallet.balance)}</p>
                </div>
                <button
                    onClick={() => setShowForm((s) => !s)}
                    className="bg-mango text-ink px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors"
                >
                    {showForm ? "Cancel" : "Withdraw funds"}
                </button>
            </div>

            {showForm && (
                <form onSubmit={submitWithdrawal} className="border border-line rounded-lg p-4 mb-10 space-y-3">
                    {formError && <p className="text-coral text-sm">{formError}</p>}

                    <div>
                        <label className="text-xs text-ash block mb-1">Amount (TZS)</label>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-ash block mb-1">Payout method</label>
                        <select
                            value={payoutMethod}
                            onChange={(e) => setPayoutMethod(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                        >
                            <option value="mobile_money">Mobile money</option>
                            <option value="bank_transfer">Bank transfer</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-ash block mb-1">
                            {payoutMethod === "mobile_money" ? "Mobile money number" : "Bank account details"}
                        </label>
                        <input
                            type="text"
                            required
                            value={payoutDetails}
                            onChange={(e) => setPayoutDetails(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm"
                            placeholder={payoutMethod === "mobile_money" ? "e.g. 0712 345 678" : "Bank, account name & number"}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                        {submitting ? "Submitting…" : "Submit request"}
                    </button>
                </form>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <p className="text-sm font-medium mb-3">Transaction history</p>
                    {wallet.transactions.length === 0 ? (
                        <p className="text-ash text-sm">No transactions yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {wallet.transactions.map((t) => (
                                <li key={t.id} className="border border-line rounded-lg p-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className={t.type === "credit" ? "text-teal" : "text-coral"}>
                                            {t.type === "credit" ? "+" : "-"}{formatMoney(t.amount)}
                                        </span>
                                        <span className="text-xs text-ash">{formatDate(t.created_at)}</span>
                                    </div>
                                    {t.description && <p className="text-xs text-ash mt-1">{t.description}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    <p className="text-sm font-medium mb-3">Withdrawal requests</p>
                    {withdrawals.length === 0 ? (
                        <p className="text-ash text-sm">No withdrawal requests yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {withdrawals.map((w) => (
                                <li key={w.id} className="border border-line rounded-lg p-3 text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="price font-medium">{formatMoney(w.amount)}</span>
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${WITHDRAWAL_STATUS_STYLES[w.status] || "bg-line text-ash"}`}>
                                            {w.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-ash">
                                        {w.payout_method === "mobile_money" ? "Mobile money" : "Bank transfer"} · {w.payout_details}
                                    </p>
                                    {w.admin_note && <p className="text-xs text-ash mt-1">Note: {w.admin_note}</p>}
                                    <p className="text-xs text-ash mt-1">{formatDate(w.requested_at)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
