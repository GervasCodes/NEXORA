import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { getPurchase, newRequestId, payPurchase } from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatDateTime, formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

export default function PurchaseDetail() {
    const { id } = useParams();
    const { t } = useLanguage();
    const toast = useToast();
    const base = useStockBase();
    const [p, setP] = useState(null);
    const [error, setError] = useState("");
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const keyRef = useRef(newRequestId());

    const load = useCallback(() => {
        setError("");
        getPurchase(id).then(setP).catch((err) => setError(extractErrorMessage(err)));
    }, [id]);
    useEffect(load, [load]);

    const pay = async (e) => {
        e.preventDefault();
        const n = Number(amount);
        if (!(n > 0)) { setFormError(t("stock.trade.amountNeeded")); return; }
        setSaving(true);
        setFormError("");
        try {
            const res = await payPurchase(id, { amount: n, method, idempotency_key: keyRef.current });
            keyRef.current = newRequestId();
            setP(res.purchase);
            setAmount("");
            toast?.success(res.replayed ? t("stock.alreadySaved") : t("stock.trade.paymentSaved"));
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;
    if (!p) return <div aria-busy="true"><Skeleton className="h-10 w-1/2 mb-4" /><Skeleton className="h-48 w-full" /></div>;

    return (
        <div className="max-w-2xl">
            <Link to={`${base}/stock/purchases`} className="text-sm text-ash underline focus-ring">{t("stock.trade.backToPurchases")}</Link>
            <h2 className="font-display text-xl mt-3">{t("stock.trade.purchase")} {p.purchase_no}</h2>
            <p className="text-sm text-ash mb-4">{formatDateTime(p.purchased_at)}{p.supplier_name ? ` · ${p.supplier_name}` : ""}{p.invoice_no ? ` · ${p.invoice_no}` : ""}</p>
            <ul className="divide-y divide-line border border-line rounded-lg mb-4">
                {p.lines.map((l) => (
                    <li key={l.id} className="p-3 flex justify-between gap-3 text-sm">
                        <span>{l.item_name}<span className="block text-xs text-ash">{l.quantity} × {formatMoney(l.unit_cost)}</span></span>
                        <span className="price whitespace-nowrap">{formatMoney(l.line_total)}</span>
                    </li>
                ))}
            </ul>
            <dl className="text-sm space-y-1 mb-4">
                <div className="flex justify-between text-base font-medium"><dt>{t("stock.trade.total")}</dt><dd className="price">{formatMoney(p.total_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.paid")}</dt><dd className="price">{formatMoney(p.paid_amount)}</dd></div>
                {p.balance > 0 && <div className="flex justify-between font-medium"><dt>{t("stock.trade.youOwe")}</dt><dd className="price">{formatMoney(p.balance)}</dd></div>}
            </dl>
            {p.balance > 0 && (
                <form onSubmit={pay} className="border border-line rounded-lg p-4 bg-line/10">
                    <p className="text-sm font-medium mb-3">{t("stock.trade.payTitle")}</p>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.amount")}
                            <Input type="number" inputMode="decimal" min="0" step="0.01" max={p.balance} value={amount} className="min-h-[44px]" onChange={(e) => setAmount(e.target.value)} /></label>
                        <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.paidWith")}
                            <select value={method} onChange={(e) => setMethod(e.target.value)} className="border border-line rounded-md px-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                                {["cash", "mobile_money", "card", "bank_transfer"].map((m) => <option key={m} value={m}>{t(`stock.trade.method.${m}`)}</option>)}
                            </select></label>
                    </div>
                    <div aria-live="polite">{formError && <p className="text-coral text-xs mt-2" role="alert">{formError}</p>}</div>
                    <Button type="submit" size="sm" className="min-h-[44px] mt-3" disabled={saving}>{saving ? t("stock.saving") : t("stock.trade.recordPayment")}</Button>
                </form>
            )}
        </div>
    );
}
