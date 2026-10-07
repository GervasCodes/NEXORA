import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import Skeleton from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import MaintenanceScreen from "../../components/MaintenanceScreen";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import Input from "../../components/ui/Input";

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
    const [loadFailed, setLoadFailed] = useState(false);
    const [maintenance, setMaintenance] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [amount, setAmount] = useState("");
    const [payoutMethod, setPayoutMethod] = useState("mobile_money");
    const [payoutDetails, setPayoutDetails] = useState("");
    const [payoutCurrency, setPayoutCurrency] = useState("TZS");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    // `silent` refreshes after a withdrawal keep the page on screen
    // instead of flashing the skeleton.
    const load = (silent = false) => {
        if (!silent) setLoading(true);
        setError("");
        setLoadFailed(false);
        setMaintenance(null);
        Promise.all([
            api.get("/wallet"),
            api.get("/wallet/withdrawals")
        ])
            .then(([w, wd]) => {
                setWallet(w.data.data);
                setWithdrawals(wd.data.data);
            })
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                } else {
                    setLoadFailed(true);
                    setError("Couldn't load your wallet. Check your connection and try again.");
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(false); }, []);

    const submitWithdrawal = async (e) => {
        e.preventDefault();
        setFormError("");

        const requested = Number(amount);
        if (!Number.isFinite(requested) || requested <= 0) {
            setFormError("Enter an amount greater than zero.");
            return;
        }
        if (wallet && requested > Number(wallet.balance)) {
            setFormError(`You can withdraw up to ${formatMoney(wallet.balance)} right now.`);
            return;
        }
        setSubmitting(true);

        try {
            await api.post("/wallet/withdrawals", {
                amount: Number(amount),
                payout_method: payoutMethod,
                payout_details: payoutDetails,
                payout_currency: payoutCurrency
            });
            setAmount("");
            setPayoutDetails("");
            setPayoutCurrency("TZS");
            setShowForm(false);
            load(true);
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="animate-fade-in" aria-busy="true" aria-label="Loading wallet">
                <Skeleton className="h-7 w-32 mb-2" />
                <Skeleton className="h-4 w-64 mb-8" />
                <div className="border border-line rounded-lg p-6 mb-8">
                    <Skeleton className="h-3 w-28 mb-3" />
                    <Skeleton className="h-9 w-48" />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                    {Array.from({ length: 2 }).map((_, col) => (
                        <div key={col} className="space-y-2">
                            <Skeleton className="h-4 w-40 mb-3" />
                            {Array.from({ length: 4 }).map((__, i) => (
                                <Skeleton key={i} className="h-14 w-full" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    if (maintenance) return <MaintenanceScreen title="Wallet is under maintenance" message={maintenance} onRetry={() => load(false)} />;
    if (loadFailed) return <ErrorState title="Couldn't load your wallet" hint={error} onRetry={() => load(false)} />;
    if (!wallet) return null;

    return (
        <div>
            <PageMeta title="Wallet" noIndex />
            <h1 className="font-display text-2xl mb-1">Wallet</h1>
            <p className="text-ash text-sm mb-8">Your earnings after platform commission, ready to withdraw.</p>

            <div className="border border-line rounded-lg p-6 mb-8 flex items-center justify-between flex-wrap gap-4">
                <div className="flex flex-wrap gap-8">
                    <div>
                        <p className="text-xs text-ash mb-1">Available balance</p>
                        <p className="price text-3xl font-medium">{formatMoney(wallet.balance)}</p>
                    </div>
                    {wallet.heldBalance > 0 && (
                        <div>
                            <p className="text-xs text-ash mb-1">Pending release</p>
                            <p className="price text-3xl font-medium text-ash">{formatMoney(wallet.heldBalance)}</p>
                            <p className="text-xs text-ash mt-1 max-w-xs">
                                Held until the order is delivered (or the booking is
                                completed) and the dispute/hold window passes, then
                                released here automatically.
                            </p>
                        </div>
                    )}
                </div>
                <Button
                    onClick={() => setShowForm((s) => !s)}
                >
                    {showForm ? "Cancel" : "Withdraw funds"}
                </Button>
            </div>

            {showForm && (
                <form onSubmit={submitWithdrawal} className="border border-line rounded-lg p-4 mb-10 space-y-3">
                    {formError && <p role="alert" className="text-coral text-sm">{formError}</p>}

                    <div>
                        <Input
                            label="Amount (TZS)"
                            type="number"
                            min="1"
                            max={Number(wallet.balance) || undefined}
                            step="1"
                            required
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={() => setAmount(String(Math.floor(Number(wallet.balance) || 0)))}
                            disabled={!(Number(wallet.balance) >= 1)}
                            className="text-xs text-teal hover:underline mt-1 disabled:opacity-50 disabled:no-underline"
                        >
                            Withdraw full balance ({formatMoney(wallet.balance)})
                        </button>
                    </div>

                    <div>
                        <label htmlFor="payoutMethod" className="text-xs text-ash block mb-1">Payout method</label>
                        <select
                            id="payoutMethod"
                            value={payoutMethod}
                            onChange={(e) => setPayoutMethod(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        >
                            <option value="mobile_money">Mobile money</option>
                            <option value="bank_transfer">Bank transfer</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="payoutCurrency" className="text-xs text-ash block mb-1">Payout currency</label>
                        <select
                            id="payoutCurrency"
                            value={payoutCurrency}
                            onChange={(e) => setPayoutCurrency(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        >
                            <option value="TZS">TZS</option>
                            <option value="USD">USD (converted at today's platform rate)</option>
                        </select>
                    </div>

                    <Input
                        label={payoutMethod === "mobile_money" ? "Mobile money number" : "Bank account details"}
                        type="text"
                        required
                        value={payoutDetails}
                        onChange={(e) => setPayoutDetails(e.target.value)}
                        placeholder={payoutMethod === "mobile_money" ? "e.g. 0712 345 678" : "Bank, account name & number"}
                    />

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
                                    {w.payout_currency === "USD" && w.payout_amount && (
                                        <p className="text-xs text-ash">
                                            Paid out as ~${w.payout_amount} USD (rate {w.payout_exchange_rate})
                                        </p>
                                    )}
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
