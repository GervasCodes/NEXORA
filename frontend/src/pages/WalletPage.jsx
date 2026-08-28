import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import PhoneInput from "../components/PhoneInput";
import EmptyState from "../components/ui/EmptyState";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";

export default function WalletPage() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    const [amount, setAmount] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const load = () => {
        api.get("/buyer-wallet/me").then(({ data }) => setSummary(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submitTopUp = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        setMessage("");
        try {
            const { data } = await api.post("/payments/wallet/topup", { phone, amount: Number(amount) });
            setMessage(data.message);
            setAmount("");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Wallet" noIndex />
            <h1 className="font-display text-2xl mb-1">{t("wallet.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("wallet.subtitle")}</p>

            <div className="border border-line rounded-lg p-6 mb-8">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">{t("wallet.balance")}</p>
                <p className="font-display text-3xl">{format(summary?.balance || 0)}</p>
            </div>

            <form onSubmit={submitTopUp} className="space-y-4 mb-10">
                <h2 className="font-display text-lg">{t("wallet.topUpTitle")}</h2>
                <div>
                    <label htmlFor="topup-phone" className="block text-sm mb-1">{t("wallet.mobileMoneyNumber")}</label>
                    <PhoneInput id="topup-phone" value={phone} onChange={setPhone} required />
                </div>
                <div>
                    <label htmlFor="topup-amount" className="block text-sm mb-1">{t("wallet.amount")}</label>
                    <input
                        id="topup-amount"
                        type="number"
                        min="1"
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
                    {submitting ? t("wallet.sending") : t("wallet.topUpButton")}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">{t("wallet.transactionHistory")}</h2>
            {summary?.transactions?.length === 0 ? (
                <EmptyState
                    title={t("wallet.noTransactionsTitle")}
                    hint={t("wallet.noTransactionsHint")}
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-ash">
                            <rect x="2" y="6" width="20" height="14" rx="2" />
                            <path d="M2 10h20M6 15h4" />
                        </svg>
                    }
                />
            ) : (
                <ul className="space-y-2">
                    {summary.transactions.map((tx) => (
                        <li key={tx.id} className="flex justify-between text-sm border-b border-line pb-2">
                            <span>
                                <span className="block">{tx.description}</span>
                                <span className="text-ash text-xs">{formatDate(tx.created_at)}</span>
                            </span>
                            <span className={tx.type === "credit" ? "text-teal" : "text-coral"}>
                                {tx.type === "credit" ? "+" : "-"}{format(tx.amount)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
