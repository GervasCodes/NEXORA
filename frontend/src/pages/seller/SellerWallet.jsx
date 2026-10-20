import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import Skeleton from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import MaintenanceScreen from "../../components/MaintenanceScreen";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";

const WITHDRAWAL_STATUS_STYLES = {
    pending: "bg-mango/20 text-mango-dark",
    approved: "bg-teal/10 text-teal",
    paid: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral"
};

export default function SellerWallet() {
    const { t } = useLanguage();
    const [wallet, setWallet] = useState(null);
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [loadFailed, setLoadFailed] = useState(false);
    const [maintenance, setMaintenance] = useState(null);

    const [showForm, setShowForm] = useState(false);
    const [amount, setAmount] = useState("");
    const [payoutMethod, setPayoutMethod] = useState("mobile_money");
    const [payoutNetwork, setPayoutNetwork] = useState("vodacom_mpesa");
    const [payoutPhone, setPayoutPhone] = useState("");
    const [bankName, setBankName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [accountName, setAccountName] = useState("");
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
                    setError(t("seller.wallet.loadFailedHint"));
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
            setFormError(t("seller.wallet.amountInvalid"));
            return;
        }
        if (wallet && requested > Number(wallet.balance)) {
            setFormError(t("seller.wallet.amountTooHigh", { amount: formatMoney(wallet.balance) }));
            return;
        }
        setSubmitting(true);

        try {
            await api.post("/wallet/withdrawals", {
                amount: Number(amount),
                payout_method: payoutMethod,
                ...(payoutMethod === "mobile_money"
                    ? { payout_network: payoutNetwork, payout_phone: payoutPhone }
                    : { payout_bank_name: bankName, payout_account_number: accountNumber, payout_account_name: accountName }),
                payout_currency: payoutCurrency
            });
            setAmount("");
            setPayoutPhone("");
            setBankName("");
            setAccountNumber("");
            setAccountName("");
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
            <div className="animate-fade-in" aria-busy="true" aria-label={t("seller.wallet.loading")}>
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
    if (maintenance) return <MaintenanceScreen title={t("seller.wallet.maintenance")} message={maintenance} onRetry={() => load(false)} />;
    if (loadFailed) return <ErrorState title={t("seller.wallet.loadFailedTitle")} hint={error} onRetry={() => load(false)} />;
    if (!wallet) return null;

    return (
        <div>
            <PageMeta title={t("seller.wallet.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.wallet.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("seller.wallet.subtitle")}</p>

            <div className="border border-line rounded-lg p-6 mb-8 flex items-center justify-between flex-wrap gap-4">
                <div className="flex flex-wrap gap-8">
                    <div>
                        <p className="text-xs text-ash mb-1">{t("seller.wallet.available")}</p>
                        <p className="price text-3xl font-medium">{formatMoney(wallet.balance)}</p>
                    </div>
                    {wallet.heldBalance > 0 && (
                        <div>
                            <p className="text-xs text-ash mb-1">{t("seller.wallet.pendingRelease")}</p>
                            <p className="price text-3xl font-medium text-ash">{formatMoney(wallet.heldBalance)}</p>
                            <p className="text-xs text-ash mt-1 max-w-xs">
                                {t("seller.wallet.heldHint")}
                            </p>
                        </div>
                    )}
                </div>
                <Button
                    onClick={() => setShowForm((s) => !s)}
                >
                    {showForm ? t("seller.wallet.cancel") : t("seller.wallet.withdraw")}
                </Button>
            </div>

            {showForm && (
                <form onSubmit={submitWithdrawal} className="border border-line rounded-lg p-4 mb-10 space-y-3">
                    {formError && <p role="alert" className="text-coral text-sm">{formError}</p>}

                    <div>
                        <Input
                            label={t("seller.wallet.amountLabel")}
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
                            {t("seller.wallet.withdrawFull", { amount: formatMoney(wallet.balance) })}
                        </button>
                    </div>

                    <div>
                        <label htmlFor="payoutMethod" className="text-xs text-ash block mb-1">{t("seller.wallet.payoutMethod")}</label>
                        <select
                            id="payoutMethod"
                            value={payoutMethod}
                            onChange={(e) => setPayoutMethod(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        >
                            <option value="mobile_money">{t("seller.wallet.mobileMoney")}</option>
                            <option value="bank_transfer">{t("seller.wallet.bankTransfer")}</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="payoutCurrency" className="text-xs text-ash block mb-1">{t("seller.wallet.payoutCurrency")}</label>
                        <select
                            id="payoutCurrency"
                            value={payoutCurrency}
                            onChange={(e) => setPayoutCurrency(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        >
                            <option value="TZS">TZS</option>
                            <option value="USD">{t("seller.wallet.usdOption")}</option>
                        </select>
                    </div>

                    {payoutMethod === "mobile_money" ? (
                        <>
                            <div>
                                <label htmlFor="payoutNetwork" className="text-xs text-ash block mb-1">{t("seller.wallet.network")}</label>
                                <select
                                    id="payoutNetwork"
                                    value={payoutNetwork}
                                    onChange={(e) => setPayoutNetwork(e.target.value)}
                                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                                >
                                    <option value="vodacom_mpesa">Vodacom M-Pesa</option>
                                    <option value="tigo_pesa">Mixx by Yas (Tigo Pesa)</option>
                                    <option value="airtel_money">Airtel Money</option>
                                    <option value="halopesa">HaloPesa</option>
                                </select>
                            </div>
                            <Input
                                label={t("seller.wallet.mobileNumber")}
                                type="tel"
                                inputMode="tel"
                                required
                                value={payoutPhone}
                                onChange={(e) => setPayoutPhone(e.target.value)}
                                placeholder={t("seller.wallet.mobilePlaceholder")}
                            />
                        </>
                    ) : (
                        <>
                            <Input
                                label={t("seller.wallet.bankName")}
                                type="text"
                                required
                                value={bankName}
                                onChange={(e) => setBankName(e.target.value)}
                                placeholder={t("seller.wallet.bankNamePlaceholder")}
                            />
                            <Input
                                label={t("seller.wallet.accountNumber")}
                                type="text"
                                inputMode="numeric"
                                required
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value)}
                            />
                            <Input
                                label={t("seller.wallet.accountName")}
                                type="text"
                                required
                                value={accountName}
                                onChange={(e) => setAccountName(e.target.value)}
                            />
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                        {submitting ? t("seller.wallet.submitting") : t("seller.wallet.submitRequest")}
                    </button>
                </form>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <p className="text-sm font-medium mb-3">{t("seller.wallet.history")}</p>
                    {wallet.transactions.length === 0 ? (
                        <p className="text-ash text-sm">{t("seller.wallet.noTransactions")}</p>
                    ) : (
                        <ul className="space-y-2">
                            {wallet.transactions.map((tx) => (
                                <li key={tx.id} className="border border-line rounded-lg p-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className={tx.type === "credit" ? "text-teal" : "text-coral"}>
                                            {tx.type === "credit" ? "+" : "-"}{formatMoney(tx.amount)}
                                        </span>
                                        <span className="text-xs text-ash">{formatDate(tx.created_at)}</span>
                                    </div>
                                    {tx.description && <p className="text-xs text-ash mt-1">{tx.description}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    <p className="text-sm font-medium mb-3">{t("seller.wallet.withdrawals")}</p>
                    {withdrawals.length === 0 ? (
                        <p className="text-ash text-sm">{t("seller.wallet.noWithdrawals")}</p>
                    ) : (
                        <ul className="space-y-2">
                            {withdrawals.map((w) => (
                                <li key={w.id} className="border border-line rounded-lg p-3 text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="price font-medium">{formatMoney(w.amount)}</span>
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${WITHDRAWAL_STATUS_STYLES[w.status] || "bg-line text-ash"}`}>
                                            {WITHDRAWAL_STATUS_STYLES[w.status] ? t(`seller.wallet.status.${w.status}`) : w.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-ash">
                                        {w.payout_method === "mobile_money" ? t("seller.wallet.mobileMoney") : t("seller.wallet.bankTransfer")} · {w.payout_details}
                                    </p>
                                    {w.payout_currency === "USD" && w.payout_amount && (
                                        <p className="text-xs text-ash">
                                            {t("seller.wallet.paidOutUsd", { amount: w.payout_amount, rate: w.payout_exchange_rate })}
                                        </p>
                                    )}
                                    {w.admin_note && <p className="text-xs text-ash mt-1">{t("seller.wallet.adminNote", { note: w.admin_note })}</p>}
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
