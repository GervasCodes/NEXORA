import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import {
    createCustomer, createSupplier, getCustomer, getSupplier, listCustomers, listSuppliers, newRequestId,
    receiveCustomerPayment, updateCustomer, updateSupplier
} from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatDateTime, formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

const API = {
    customer: { list: listCustomers, create: createCustomer, update: updateCustomer, get: getCustomer },
    supplier: { list: listSuppliers, create: createSupplier, update: updateSupplier, get: getSupplier }
};

function CustomerDetail({ id, onChanged }) {
    const { t } = useLanguage();
    const toast = useToast();
    const base = useStockBase();
    const [data, setData] = useState(null);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const keyRef = useRef(newRequestId());

    const load = useCallback(() => { getCustomer(id).then(setData).catch((err) => setError(extractErrorMessage(err))); }, [id]);
    useEffect(load, [load]);

    const pay = async (e) => {
        e.preventDefault();
        const n = Number(amount);
        if (!(n > 0)) { setError(t("stock.trade.amountNeeded")); return; }
        setSaving(true);
        setError("");
        try {
            const res = await receiveCustomerPayment(id, { amount: n, method, idempotency_key: keyRef.current });
            keyRef.current = newRequestId();
            setData(res.statement);
            setAmount("");
            toast?.success(res.replayed ? t("stock.alreadySaved") : t("stock.trade.paymentSaved"));
            onChanged();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (!data) return <div aria-busy="true"><Skeleton className="h-16 w-full" /></div>;
    const owed = data.customer.owed;
    return (
        <div className="mt-3">
            {owed > 0 ? (
                <form onSubmit={pay} className="border border-line rounded-lg p-4 bg-line/10">
                    <p className="text-sm font-medium mb-1">{t("stock.trade.receivePayment")}</p>
                    <p className="text-xs text-ash mb-3">{t("stock.trade.oldestFirst")}</p>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.amount")}
                            <Input type="number" inputMode="decimal" min="0" step="0.01" max={owed} value={amount} className="min-h-[44px]" onChange={(e) => setAmount(e.target.value)} /></label>
                        <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.paidWith")}
                            <select value={method} onChange={(e) => setMethod(e.target.value)} className="border border-line rounded-md px-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                                {["cash", "mobile_money", "card", "bank_transfer"].map((m) => <option key={m} value={m}>{t(`stock.trade.method.${m}`)}</option>)}
                            </select></label>
                    </div>
                    <div aria-live="polite">{error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}</div>
                    <Button type="submit" size="sm" className="min-h-[44px] mt-3" disabled={saving}>{saving ? t("stock.saving") : t("stock.trade.recordPayment")}</Button>
                </form>
            ) : <p className="text-sm text-ash">{t("stock.trade.owesNothing")}</p>}
            {data.sales.length > 0 && (
                <ul className="mt-3 divide-y divide-line border border-line rounded-lg text-sm">
                    {data.sales.slice(0, 10).map((s) => (
                        <li key={s.id}>
                            <Link to={`${base}/stock/sales/${s.id}`} className="flex justify-between gap-2 px-3 py-2 min-h-[44px] items-center hover:bg-line/20 focus-ring">
                                <span>{s.receipt_no} <span className="text-xs text-ash">{formatDateTime(s.sold_at)}</span></span>
                                <span className="price">{s.status === "voided" ? t("stock.trade.cancelled") : formatMoney(s.total_amount)}{s.balance > 0 ? ` · ${t("stock.trade.owes", { amount: formatMoney(s.balance) })}` : ""}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function SupplierDetail({ id }) {
    const { t } = useLanguage();
    const base = useStockBase();
    const [data, setData] = useState(null);
    useEffect(() => { getSupplier(id).then(setData).catch(() => setData({ purchases: [] })); }, [id]);
    if (!data) return <div aria-busy="true"><Skeleton className="h-16 w-full" /></div>;
    if (!data.purchases.length) return <p className="text-sm text-ash mt-3">{t("stock.trade.noPurchases")}</p>;
    return (
        <ul className="mt-3 divide-y divide-line border border-line rounded-lg text-sm">
            {data.purchases.slice(0, 10).map((p) => (
                <li key={p.id}>
                    <Link to={`${base}/stock/purchases/${p.id}`} className="flex justify-between gap-2 px-3 py-2 min-h-[44px] items-center hover:bg-line/20 focus-ring">
                        <span>{p.purchase_no} <span className="text-xs text-ash">{formatDateTime(p.purchased_at)}</span></span>
                        <span className="price">{formatMoney(p.total_amount)}{p.balance > 0 ? ` · ${t("stock.trade.youOweAmount", { amount: formatMoney(p.balance) })}` : ""}</span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

// Customers (what they owe you) and suppliers (what you owe them) share one screen.
export default function Parties({ kind }) {
    const { t } = useLanguage();
    const toast = useToast();
    const api = API[kind];
    const [q, setQ] = useState("");
    const [search, setSearch] = useState("");
    const [owing, setOwing] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [open, setOpen] = useState(null);
    const [form, setForm] = useState(null); // { id?, name, phone, note }
    const [formError, setFormError] = useState("");

    useEffect(() => {
        const id = setTimeout(() => setSearch(q.trim()), 300);
        return () => clearTimeout(id);
    }, [q]);

    const load = useCallback(() => {
        setError("");
        api.list({ limit: 100, q: search || undefined, owing: owing ? 1 : undefined }).then(setData).catch((err) => setError(extractErrorMessage(err)));
    }, [api, search, owing]);
    useEffect(load, [load]);

    const save = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { setFormError(t("stock.trade.nameNeeded")); return; }
        try {
            const body = { name: form.name.trim(), phone: form.phone?.trim() || (form.id ? null : undefined), note: form.note?.trim() || (form.id ? null : undefined) };
            await (form.id ? api.update(form.id, body) : api.create(body));
            toast?.success(t("stock.saved"));
            setForm(null);
            setFormError("");
            load();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        }
    };

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;
    const isCustomer = kind === "customer";

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <label className="flex-1 min-w-[12rem] text-xs text-ash flex flex-col gap-1">{t("stock.trade.searchPeople")}
                    <Input type="search" value={q} className="min-h-[44px]" onChange={(e) => setQ(e.target.value)} /></label>
                <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-ash">
                    <input type="checkbox" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
                    {t(isCustomer ? "stock.trade.onlyOwing" : "stock.trade.onlyYouOwe")}
                </label>
                <Button className="min-h-[44px]" onClick={() => setForm({ name: "", phone: "", note: "" })}>{t(isCustomer ? "stock.trade.addCustomer" : "stock.trade.addSupplier")}</Button>
            </div>

            {form && (
                <form onSubmit={save} className="border border-line rounded-lg p-4 bg-line/10 mb-4 grid sm:grid-cols-3 gap-3">
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.customerName")}
                        <Input type="text" maxLength={120} value={form.name} className="min-h-[44px]" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.phone")}
                        <Input type="tel" maxLength={30} value={form.phone || ""} className="min-h-[44px]" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.note")}
                        <Input type="text" maxLength={255} value={form.note || ""} className="min-h-[44px]" onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                    <div className="sm:col-span-3" aria-live="polite">{formError && <p className="text-coral text-xs" role="alert">{formError}</p>}</div>
                    <div className="flex gap-2 sm:col-span-3">
                        <Button type="submit" size="sm" className="min-h-[44px]">{t("stock.save")}</Button>
                        <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={() => { setForm(null); setFormError(""); }}>{t("stock.cancel")}</Button>
                    </div>
                </form>
            )}

            {data && <p className="text-sm mb-3"><span className="text-ash">{t(isCustomer ? "stock.trade.owedToYou" : "stock.trade.youOwe")}: </span><span className="price font-medium">{formatMoney(data.total_owed)}</span></p>}

            {!data ? <div aria-busy="true"><Skeleton className="h-16 w-full mb-2" /><Skeleton className="h-16 w-full" /></div>
                : data.items.length === 0 ? <EmptyState title={t(isCustomer ? "stock.trade.noCustomers" : "stock.trade.noSuppliers")} hint={t("stock.trade.noPeopleHint")} />
                : (
                    <ul className="divide-y divide-line border border-line rounded-lg">
                        {data.items.map((p) => (
                            <li key={p.id} className="p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{p.name}</p>
                                        <p className="text-xs text-ash">{[p.phone, p.note].filter(Boolean).join(" · ")}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {p.owed > 0 && <span className="text-sm price text-mango-dark">{formatMoney(p.owed)}</span>}
                                        <Button size="sm" variant="secondary" className="min-h-[44px]" aria-expanded={open === p.id}
                                            onClick={() => setOpen(open === p.id ? null : p.id)}>{t("stock.trade.details")}</Button>
                                        <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setForm({ id: p.id, name: p.name, phone: p.phone || "", note: p.note || "" })}>{t("stock.edit")}</Button>
                                    </div>
                                </div>
                                {open === p.id && (isCustomer ? <CustomerDetail id={p.id} onChanged={load} /> : <SupplierDetail id={p.id} />)}
                            </li>
                        ))}
                    </ul>
                )}
        </div>
    );
}
