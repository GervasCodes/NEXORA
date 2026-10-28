import { useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PhoneInput from "../components/PhoneInput";
import EmptyState from "../components/ui/EmptyState";
import PageState from "../components/ui/PageState";
import useFetch from "../hooks/useFetch";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";

// Common round TZS mobile-money top-up amounts ( UI/UX
// remediation) - see the preset chips' own comment below for why these
// exist as one-tap shortcuts rather than a second input.
const TOPUP_PRESETS = [5000, 10000, 20000, 50000];

const csvCell = (value) => {
    const s = String(value ?? "");
    // Neutralise spreadsheet formula injection from free-text descriptions.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
};

export default function WalletPage() {
    const { format } = useCurrency();
    const { t } = useLanguage();

    // (Phase 4 remediation) - previously this was a bare
    // `.then(setSummary).finally(...)` with no `.catch()`, so a failed
    // load left `summary` null forever: the transaction list then did
    // `summary.transactions.map(...)` with no optional chaining and
    // crashed the whole page instead of showing an error. useFetch +
    // PageState give this page the same error-with-retry treatment
    // every other data page has.
    const { data: summary, loading, error, retry } = useFetch(
        () => api.get("/buyer-wallet/me").then(({ data }) => data.data),
        []
    );

    const [amount, setAmount] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [submitError, setSubmitError] = useState("");
    const [topUpPending, setTopUpPending] = useState(false);

    const submitTopUp = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setSubmitError("");
        setMessage("");
        try {
            const { data } = await api.post("/payments/wallet/topup", { phone, amount: Number(amount) });
            setMessage(data.message);
            setAmount("");
            // A top-up is a mobile-money push: it isn't credited yet
            // when this call returns, only initiated. Previously the
            // page just showed the provider's message and never
            // touched `summary` again, so the balance and history
            // looked unchanged until the buyer manually reloaded the
            // page. We show a pending note and re-poll the summary so
            // the balance/history catch up once the webhook lands.
            setTopUpPending(true);
            retry();
            setTimeout(retry, 8000);
            setTimeout(() => setTopUpPending(false), 20000);
        } catch (err) {
            setSubmitError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const limits = summary?.topUpLimits;
    const amountNumber = Number(amount);
    const amountOutOfRange =
        limits && amount !== "" && (amountNumber < limits.minAmount || amountNumber > limits.maxAmount);

    // Statement = the transactions already loaded on this page, exported
    // as a CSV the buyer can open in Excel / Sheets.
    const exportStatement = () => {
        const rows = summary?.transactions || [];
        const header = [t("wallet.statement.date"), t("wallet.statement.description"), t("wallet.statement.type"), t("wallet.statement.amount")];
        const lines = [header, ...rows.map((tx) => [
            new Date(tx.created_at).toISOString().slice(0, 10),
            tx.description || "",
            tx.type,
            `${tx.type === "credit" ? "" : "-"}${Number(tx.amount)}`
        ])].map((cols) => cols.map(csvCell).join(","));
        const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `nexora-wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Wallet" noIndex />
            <h1 className="font-display text-2xl mb-1">{t("wallet.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("wallet.subtitle")}</p>

            <PageState
                loading={loading}
                error={error}
                onRetry={retry}
                errorProps={{ title: t("wallet.loadErrorTitle"), hint: t("wallet.loadErrorHint") }}
            >
                <div className="border border-line rounded-lg p-6 mb-8">
                    <p className="text-xs uppercase tracking-widest text-ash mb-1">{t("wallet.balance")}</p>
                    <p className="font-display text-3xl">{format(summary?.balance || 0)}</p>
                    {topUpPending && <p className="text-xs text-mango-dark mt-2">{t("wallet.topUpPending")}</p>}
                </div>

                <form onSubmit={submitTopUp} className="space-y-4 mb-10">
                    <h2 className="font-display text-lg">{t("wallet.topUpTitle")}</h2>
                    <div>
                        <label htmlFor="topup-phone" className="block text-sm mb-1">{t("wallet.mobileMoneyNumber")}</label>
                        <PhoneInput id="topup-phone" value={phone} onChange={setPhone} required />
                    </div>
                    <div>
                        <label htmlFor="topup-amount" className="block text-sm mb-1">{t("wallet.amount")}</label>
                        {/* Quick-amount presets ( UI/UX remediation) -
                            common round TZS amounts as one-tap chips, since
                            this is a mobile-money top-up flow where typing a
                            round number by hand is exactly the kind of small
                            friction a preset removes. Purely a convenience
                            fill of the same field below, not a separate
                            input - the buyer can still type any amount. */}
                        <div className="flex flex-wrap gap-2 mb-2">
                            {TOPUP_PRESETS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setAmount(String(preset))}
                                    className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                        String(preset) === amount ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                                    }`}
                                >
                                    {format(preset)}
                                </button>
                            ))}
                        </div>
                        <input
                            id="topup-amount"
                            type="number"
                            inputMode="numeric"
                            min={limits?.minAmount || 1}
                            max={limits?.maxAmount || undefined}
                            required
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            aria-describedby="topup-amount-hint"
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                        {limits && (
                            <p
                                id="topup-amount-hint"
                                className={`text-xs mt-1 ${amountOutOfRange ? "text-coral" : "text-ash"}`}
                            >
                                {t("wallet.topUpLimits", { min: format(limits.minAmount), max: format(limits.maxAmount) })}
                            </p>
                        )}
                    </div>

                    {message && <p className="text-sm text-teal">{message}</p>}
                    {submitError && <p className="text-sm text-coral">{submitError}</p>}

                    <button
                        type="submit"
                        disabled={submitting || amountOutOfRange}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? t("wallet.sending") : t("wallet.topUpButton")}
                    </button>
                </form>

                <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="font-display text-lg">{t("wallet.transactionHistory")}</h2>
                    {summary?.transactions?.length > 0 && (
                        <button
                            type="button"
                            onClick={exportStatement}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                        >
                            {t("wallet.statement.export")}
                        </button>
                    )}
                </div>
                {!summary?.transactions?.length ? (
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
            </PageState>
        </div>
    );
}
