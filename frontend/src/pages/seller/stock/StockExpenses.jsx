import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { createExpense, listExpenses, newRequestId, voidExpense } from "../../../api/stock";
import ConfirmDialog from "../../../components/ConfirmDialog";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { daysAgoDar, todayDar } from "../../../utils/darDate";
import { formatMoney } from "../../../utils/format";

const CATEGORIES = ["rent", "transport", "salaries", "electricity_water", "airtime_internet", "packaging", "tax_licence", "repairs", "marketing", "other"];
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// Expenses (matumizi): money spent that is not stock. They reduce profit in the reports.
export default function StockExpenses() {
    const { t } = useLanguage();
    const toast = useToast();
    const { access } = useOutletContext() || {};
    const readOnly = !!access?.read_only;

    const [from, setFrom] = useState(daysAgoDar(29));
    const [to, setTo] = useState(todayDar());
    const [category, setCategory] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [toVoid, setToVoid] = useState(null);

    const [form, setForm] = useState({ category: "rent", amount: "", expense_date: todayDar(), note: "" });
    const [receipt, setReceipt] = useState(null);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const keyRef = useRef(newRequestId());
    const fileRef = useRef(null);

    const load = useCallback(() => {
        setError("");
        listExpenses({ from, to, category: category || undefined, limit: 50 })
            .then(setData)
            .catch((err) => setError(extractErrorMessage(err)));
    }, [from, to, category]);
    useEffect(load, [load]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const pickFile = (e) => {
        const file = e.target.files?.[0] || null;
        setFormError("");
        if (file && !file.type.startsWith("image/")) { setFormError(t("stock.p8.exp.receiptType")); e.target.value = ""; return; }
        if (file && file.size > MAX_RECEIPT_BYTES) { setFormError(t("stock.p8.exp.receiptSize")); e.target.value = ""; return; }
        setReceipt(file);
    };

    const submit = async (e) => {
        e.preventDefault();
        setFormError("");
        const amount = Number(form.amount);
        if (!(amount > 0)) { setFormError(t("stock.p8.exp.amountNeeded")); return; }
        setSaving(true);
        try {
            const res = await createExpense({ ...form, amount, receipt, idempotency_key: keyRef.current });
            toast?.success(res.replayed ? t("stock.alreadySaved") : t("stock.p8.exp.saved"));
            keyRef.current = newRequestId();
            setForm((f) => ({ ...f, amount: "", note: "" }));
            setReceipt(null);
            if (fileRef.current) fileRef.current.value = "";
            load();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const confirmVoid = async () => {
        const target = toVoid;
        setToVoid(null);
        try {
            await voidExpense(target.id, {});
            toast?.success(t("stock.p8.exp.cancelled"));
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        }
    };

    return (
        <div className="grid lg:grid-cols-[22rem_1fr] gap-6">
            <form onSubmit={submit} className="border border-line rounded-lg p-4 space-y-3 self-start" aria-label={t("stock.p8.exp.new")}>
                <h2 className="font-display text-lg">{t("stock.p8.exp.new")}</h2>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.p8.exp.category")}
                    <select value={form.category} onChange={set("category")} className="border border-line rounded-md px-3 min-h-[44px] text-sm bg-paper focus-ring" disabled={readOnly}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{t(`stock.p8.cat.${c}`)}</option>)}
                    </select>
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.p8.exp.amount")}
                    <Input type="number" inputMode="decimal" min="1" step="any" value={form.amount} onChange={set("amount")} className="min-h-[44px]" disabled={readOnly} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.p8.exp.date")}
                    <Input type="date" max={todayDar()} value={form.expense_date} onChange={set("expense_date")} className="min-h-[44px]" disabled={readOnly} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.p8.exp.note")}
                    <Input value={form.note} maxLength={255} onChange={set("note")} className="min-h-[44px]" disabled={readOnly} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.p8.exp.receipt")}
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickFile} disabled={readOnly}
                        className="text-sm min-h-[44px] file:mr-3 file:min-h-[44px] file:px-3 file:border file:border-line file:rounded-md file:bg-paper" />
                    <span className="text-[11px]">{t("stock.p8.exp.receiptHint")}</span>
                </label>
                <div aria-live="polite">{formError && <p className="text-coral text-xs" role="alert">{formError}</p>}</div>
                <Button type="submit" className="w-full min-h-[44px]" disabled={saving || readOnly}>{saving ? t("stock.saving") : t("stock.p8.exp.save")}</Button>
            </form>

            <section aria-live="polite">
                <div className="flex flex-wrap items-end gap-3 mb-4">
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.from")}
                        <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="min-h-[44px]" /></label>
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.to")}
                        <Input type="date" value={to} min={from} max={todayDar()} onChange={(e) => setTo(e.target.value)} className="min-h-[44px]" /></label>
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.exp.category")}
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-line rounded-md px-3 min-h-[44px] text-sm bg-paper focus-ring">
                            <option value="">{t("stock.p8.exp.allCategories")}</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`stock.p8.cat.${c}`)}</option>)}
                        </select></label>
                </div>
                {error ? <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />
                    : !data ? <div aria-busy="true"><Skeleton className="h-16 w-full mb-2" /><Skeleton className="h-16 w-full" /></div>
                        : (
                            <>
                                <p className="text-sm mb-3"><span className="text-ash">{t("stock.p8.exp.total")}: </span><span className="font-medium price">{formatMoney(data.total_amount)}</span></p>
                                {data.items.length === 0 ? <EmptyState title={t("stock.p8.exp.none")} hint={t("stock.p8.exp.noneHint")} /> : (
                                    <ul className="divide-y divide-line border border-line rounded-lg">
                                        {data.items.map((x) => (
                                            <li key={x.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium">{t(`stock.p8.cat.${x.category}`)}{x.status === "voided" && <span className="ml-2 text-xs text-coral">{t("stock.p8.exp.voided")}</span>}</span>
                                                    <span className="block text-xs text-ash">{x.expense_date}{x.note ? ` · ${x.note}` : ""}</span>
                                                    {x.receipt_url && <a href={x.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs underline focus-ring">{t("stock.p8.exp.viewReceipt")}</a>}
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <span className="price font-medium">{formatMoney(x.amount)}</span>
                                                    {x.status !== "voided" && !readOnly && (
                                                        <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setToVoid(x)}>{t("stock.p8.exp.cancel")}</Button>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
            </section>
            <ConfirmDialog open={!!toVoid} danger title={t("stock.p8.exp.cancelTitle")} description={t("stock.p8.exp.cancelBody")}
                confirmLabel={t("stock.p8.exp.cancel")} cancelLabel={t("stock.p8.keep")} onConfirm={confirmVoid} onCancel={() => setToVoid(null)} />
        </div>
    );
}
