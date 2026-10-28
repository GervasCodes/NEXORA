import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { downloadReceiptPdf, getReceipt, getSale, newRequestId, returnSale, voidSale } from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatDateTime, formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

function ReturnPanel({ sale, onClose, onDone }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [qty, setQty] = useState({});
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const keyRef = useRef(newRequestId());

    const submit = async (e) => {
        e.preventDefault();
        const lines = Object.entries(qty).filter(([, n]) => Number(n) > 0).map(([id, n]) => ({ sale_line_id: Number(id), quantity: Number(n) }));
        if (!lines.length) { setError(t("stock.trade.chooseReturn")); return; }
        setSaving(true);
        setError("");
        try {
            const res = await returnSale(sale.id, { lines, reason: reason.trim() || undefined, idempotency_key: keyRef.current });
            toast?.success(t("stock.trade.returnSaved"));
            onDone(res.sale);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="border border-line rounded-lg p-4 bg-line/10 mt-4">
            <p className="text-sm font-medium mb-3">{t("stock.trade.returnTitle")}</p>
            <ul className="space-y-2">
                {sale.lines.filter((l) => l.quantity - l.returned_quantity > 0).map((l) => {
                    const left = l.quantity - l.returned_quantity;
                    return (
                        <li key={l.id} className="flex items-center justify-between gap-3">
                            <span className="text-sm min-w-0 truncate">{l.item_name} <span className="text-ash">({t("stock.trade.canReturn", { count: left })})</span></span>
                            <Input type="number" inputMode="numeric" min="0" max={left} step="1" value={qty[l.id] ?? ""} className="w-20 min-h-[44px]"
                                aria-label={t("stock.trade.returnQty", { name: l.item_name })}
                                onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />
                        </li>
                    );
                })}
            </ul>
            <label className="text-xs text-ash flex flex-col gap-1 mt-3">
                {t("stock.reason")}
                <Input type="text" maxLength={255} value={reason} className="min-h-[44px]" onChange={(e) => setReason(e.target.value)} />
            </label>
            <div aria-live="polite">{error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}</div>
            <div className="flex gap-2 mt-3">
                <Button type="submit" size="sm" className="min-h-[44px]" disabled={saving}>{saving ? t("stock.saving") : t("stock.trade.recordReturn")}</Button>
                <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={onClose}>{t("stock.cancel")}</Button>
            </div>
        </form>
    );
}

function VoidPanel({ sale, onClose, onDone }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (reason.trim().length < 3) { setError(t("stock.trade.reasonNeeded")); return; }
        setSaving(true);
        setError("");
        try {
            const res = await voidSale(sale.id, { reason: reason.trim() });
            toast?.success(t("stock.trade.voidSaved"));
            onDone(res);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="border border-coral/40 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium">{t("stock.trade.voidTitle")}</p>
            <p className="text-xs text-ash mt-1 mb-3">{t("stock.trade.voidWarn")}</p>
            <label className="text-xs text-ash flex flex-col gap-1">
                {t("stock.trade.voidReason")}
                <Input type="text" maxLength={255} value={reason} className="min-h-[44px]" onChange={(e) => setReason(e.target.value)} />
            </label>
            <div aria-live="polite">{error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}</div>
            <div className="flex gap-2 mt-3">
                <Button type="submit" size="sm" className="min-h-[44px]" disabled={saving}>{saving ? t("stock.saving") : t("stock.trade.confirmVoid")}</Button>
                <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={onClose}>{t("stock.cancel")}</Button>
            </div>
        </form>
    );
}

export default function SaleDetail() {
    const { id } = useParams();
    const { t, language } = useLanguage();
    const toast = useToast();
    const base = useStockBase();
    const [sale, setSale] = useState(null);
    const [error, setError] = useState("");
    const [panel, setPanel] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        setError("");
        getSale(id).then(setSale).catch((err) => setError(extractErrorMessage(err)));
    }, [id]);
    useEffect(load, [load]);

    const lang = language === "sw" ? "sw" : "en";

    const share = async () => {
        setBusy(true);
        try {
            const r = await getReceipt(id, lang);
            if (navigator.share) {
                await navigator.share({ title: `${t("stock.trade.receipt")} ${r.sale.receipt_no}`, text: r.share_text });
            } else {
                window.open(`https://wa.me/?text=${encodeURIComponent(r.share_text)}`, "_blank", "noopener,noreferrer");
            }
        } catch (err) {
            if (err?.name !== "AbortError") toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const pdf = async () => {
        setBusy(true);
        try {
            await downloadReceiptPdf(id, lang, `receipt-${sale.receipt_no}.pdf`);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;
    if (!sale) return <div aria-busy="true"><Skeleton className="h-10 w-1/2 mb-4" /><Skeleton className="h-48 w-full" /></div>;

    const voided = sale.status === "voided";
    const canChange = !voided && sale.source !== "legacy";
    const anyLeft = sale.lines.some((l) => l.quantity - l.returned_quantity > 0 && l.stock_item_id);

    return (
        <div className="max-w-2xl">
            <Link to={`${base}/stock/sales`} className="text-sm text-ash underline focus-ring">{t("stock.trade.backToSales")}</Link>
            <div className="flex flex-wrap items-start justify-between gap-3 mt-3 mb-4">
                <div>
                    <h2 className="font-display text-xl">{t("stock.trade.receipt")} {sale.receipt_no}</h2>
                    <p className="text-sm text-ash">{formatDateTime(sale.sold_at)}{sale.customer_name ? ` · ${sale.customer_name}` : ""}</p>
                    {sale.is_backdated && <p className="text-xs text-ash">{t("stock.trade.wasBackdated")}</p>}
                </div>
                {voided && <span className="text-sm px-3 py-1 rounded-full bg-coral/10 text-coral">{t("stock.trade.cancelled")}</span>}
            </div>
            {voided && <p className="text-sm mb-4">{t("stock.trade.voidedBecause", { reason: sale.void_reason })}</p>}

            <ul className="divide-y divide-line border border-line rounded-lg mb-4">
                {sale.lines.map((l) => (
                    <li key={l.id} className="p-3 flex justify-between gap-3 text-sm">
                        <span className="min-w-0">
                            {l.item_name}{l.variant_label ? <span className="text-ash"> ({l.variant_label})</span> : null}
                            <span className="block text-xs text-ash">{l.quantity} × {formatMoney(l.unit_price)}{l.returned_quantity > 0 ? ` · ${t("stock.trade.returnedCount", { count: l.returned_quantity })}` : ""}</span>
                        </span>
                        <span className="price whitespace-nowrap">{formatMoney(l.line_total)}</span>
                    </li>
                ))}
            </ul>

            <dl className="text-sm space-y-1 mb-4">
                {sale.discount_amount > 0 && <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.discount")}</dt><dd className="price">-{formatMoney(sale.discount_amount)}</dd></div>}
                {sale.returned_amount > 0 && <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.returned")}</dt><dd className="price">-{formatMoney(sale.returned_amount)}</dd></div>}
                <div className="flex justify-between text-base font-medium"><dt>{t("stock.trade.total")}</dt><dd className="price">{formatMoney(sale.net_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.paid")} ({t("stock.trade.method." + sale.payment_method)})</dt><dd className="price">{formatMoney(sale.paid_amount)}</dd></div>
                {sale.balance > 0 && <div className="flex justify-between font-medium"><dt>{t("stock.trade.owed")}</dt><dd className="price">{formatMoney(sale.balance)}</dd></div>}
            </dl>

            <div className="flex flex-wrap gap-2">
                <Button size="sm" className="min-h-[44px]" onClick={share} disabled={busy}>{t("stock.trade.shareReceipt")}</Button>
                <Button size="sm" variant="secondary" className="min-h-[44px]" onClick={pdf} disabled={busy}>{t("stock.trade.downloadPdf")}</Button>
                {canChange && anyLeft && <Button size="sm" variant="secondary" className="min-h-[44px]" onClick={() => setPanel("return")}>{t("stock.trade.returnItems")}</Button>}
                {canChange && <Button size="sm" variant="ghost" className="min-h-[44px] text-coral" onClick={() => setPanel("void")}>{t("stock.trade.cancelSale")}</Button>}
            </div>
            <p className="text-xs text-ash mt-3">{t("stock.trade.notFiscal")}</p>

            {panel === "return" && <ReturnPanel sale={sale} onClose={() => setPanel(null)} onDone={(s) => { setSale(s); setPanel(null); }} />}
            {panel === "void" && <VoidPanel sale={sale} onClose={() => setPanel(null)} onDone={(s) => { setSale(s); setPanel(null); }} />}
        </div>
    );
}
