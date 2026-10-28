import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { createCustomer, createSale, listCustomers, newRequestId } from "../../../api/stock";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatMoney } from "../../../utils/format";
import { queueSale } from "../../../utils/stockOfflineStore";
import ItemPicker from "./ItemPicker";
import { SourceBadge } from "./StockItems";
import useStockBase from "./useStockBase";

const METHODS = ["cash", "mobile_money", "card", "bank_transfer", "credit"];
const MONEY_METHODS = ["cash", "mobile_money", "card", "bank_transfer"];
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

// Multi-line quick sale: search or scan, adjust quantity / price, pick how the
// customer pays, record. Credit sales need a customer and may be part-paid.
export default function QuickSale() {
    const { t } = useLanguage();
    const toast = useToast();
    const base = useStockBase();
    const navigate = useNavigate();
    const [lines, setLines] = useState([]);
    const [discount, setDiscount] = useState("");
    const [method, setMethod] = useState("cash");
    const [paidVia, setPaidVia] = useState("cash");
    const [amountPaid, setAmountPaid] = useState("");
    const [customers, setCustomers] = useState([]);
    const [customerId, setCustomerId] = useState("");
    const [newCustomer, setNewCustomer] = useState(null); // { name, phone }
    const [walkIn, setWalkIn] = useState("");
    const [note, setNote] = useState("");
    const [soldAt, setSoldAt] = useState("");
    const [showDate, setShowDate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const keyRef = useRef(newRequestId());

    useEffect(() => {
        listCustomers({ limit: 100 }).then((d) => setCustomers(d.items)).catch(() => {});
    }, []);

    const add = (item) => {
        setError("");
        setLines((cur) => {
            const i = cur.findIndex((l) => l.item.id === item.id);
            if (i >= 0) return cur.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
            return [...cur, { item, quantity: 1, unitPrice: String(item.sell_price) }];
        });
    };
    const patch = (id, change) => setLines((cur) => cur.map((l) => (l.item.id === id ? { ...l, ...change } : l)));
    const remove = (id) => setLines((cur) => cur.filter((l) => l.item.id !== id));

    const totals = useMemo(() => {
        const subtotal = round2(lines.reduce((s, l) => s + (num(l.unitPrice) || 0) * (l.quantity || 0), 0));
        const disc = Math.min(Math.max(num(discount) || 0, 0), subtotal);
        const total = round2(subtotal - disc);
        const paid = method === "credit" ? Math.min(Math.max(num(amountPaid) || 0, 0), total) : total;
        return { subtotal, disc, total, paid, owed: round2(total - paid) };
    }, [lines, discount, method, amountPaid]);

    const addCustomer = async () => {
        if (!newCustomer || !newCustomer.name.trim()) { setError(t("stock.trade.customerNameNeeded")); return; }
        try {
            const c = await createCustomer({ name: newCustomer.name.trim(), phone: newCustomer.phone?.trim() || undefined });
            setCustomers((cur) => [...cur, c].sort((a, b) => a.name.localeCompare(b.name)));
            setCustomerId(String(c.id));
            setNewCustomer(null);
            setError("");
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!lines.length) { setError(t("stock.trade.addOneItem")); return; }
        if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || !(num(l.unitPrice) >= 0))) {
            setError(t("stock.trade.checkLines"));
            return;
        }
        if (method === "credit" && totals.owed > 0 && !customerId) { setError(t("stock.trade.creditNeedsCustomer")); return; }
        setSaving(true);
        const body = {
            lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity, unit_price: num(l.unitPrice) })),
            discount: totals.disc || undefined,
            payment_method: method,
            paid_via: method === "credit" && totals.paid > 0 ? paidVia : undefined,
            amount_paid: method === "credit" ? totals.paid : undefined,
            customer_id: customerId ? Number(customerId) : undefined,
            customer_name: !customerId && walkIn.trim() ? walkIn.trim() : undefined,
            note: note.trim() || undefined,
            sold_at: showDate && soldAt ? new Date(soldAt).toISOString() : undefined,
            idempotency_key: keyRef.current
        };

        // No connection: keep the sale on this device (the same request id, so if it did reach
        // the server after all, sending it later can't record it twice) and carry on selling.
        const saveOffline = async () => {
            await queueSale({ ...body, sold_at: body.sold_at || new Date().toISOString() }, {
                total: totals.total, lines: lines.map((l) => ({ name: l.item.name, quantity: l.quantity }))
            });
            toast?.success(t("stock.p8.off.savedHere"));
            keyRef.current = newRequestId();
            setLines([]); setDiscount(""); setAmountPaid(""); setNote(""); setWalkIn(""); setSoldAt(""); setShowDate(false);
        };

        try {
            if (typeof navigator !== "undefined" && navigator.onLine === false) { await saveOffline(); return; }
            const res = await createSale(body);
            toast?.success(res.replayed ? t("stock.alreadySaved") : t("stock.trade.saleSaved"));
            keyRef.current = newRequestId();
            navigate(`${base}/stock/sales/${res.sale.id}`);
        } catch (err) {
            if (!err.response) {
                try { await saveOffline(); } catch { setError(t("stock.p8.off.cantSave")); }
            } else {
                setError(extractErrorMessage(err));
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_22rem] gap-6">
            <div>
                <ItemPicker onPick={add} focusOnMount />
                {lines.length === 0 ? (
                    <p className="text-sm text-ash mt-6">{t("stock.trade.emptyCart")}</p>
                ) : (
                    <ul className="mt-4 divide-y divide-line border border-line rounded-lg">
                        {lines.map((l) => (
                            <li key={l.item.id} className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium min-w-0">
                                        {l.item.name}{l.item.variant_label ? <span className="text-ash font-normal"> ({l.item.variant_label})</span> : null}
                                        <span className="ml-2 align-middle"><SourceBadge source={l.item.source} /></span>
                                    </p>
                                    <Button type="button" variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]"
                                        aria-label={t("stock.trade.removeLine", { name: l.item.name })} onClick={() => remove(l.item.id)}>×</Button>
                                </div>
                                <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-end mt-2">
                                    <div className="flex items-center gap-1" role="group" aria-label={t("stock.trade.quantity")}>
                                        <Button type="button" variant="secondary" size="sm" className="min-h-[44px] min-w-[44px]"
                                            aria-label={t("stock.trade.less")} onClick={() => patch(l.item.id, { quantity: Math.max(1, l.quantity - 1) })}>−</Button>
                                        <Input type="number" inputMode="numeric" min="1" step="1" value={l.quantity} className="w-16 text-center min-h-[44px]"
                                            aria-label={t("stock.trade.quantity")}
                                            onChange={(e) => patch(l.item.id, { quantity: Math.floor(Number(e.target.value)) || 0 })} />
                                        <Button type="button" variant="secondary" size="sm" className="min-h-[44px] min-w-[44px]"
                                            aria-label={t("stock.trade.more")} onClick={() => patch(l.item.id, { quantity: l.quantity + 1 })}>+</Button>
                                    </div>
                                    <label className="text-xs text-ash flex flex-col gap-1">
                                        {t("stock.trade.unitPrice")}
                                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={l.unitPrice} className="min-h-[44px]"
                                            onChange={(e) => patch(l.item.id, { unitPrice: e.target.value })} />
                                    </label>
                                    <p className="text-sm font-medium price pb-3 whitespace-nowrap">{formatMoney((num(l.unitPrice) || 0) * l.quantity)}</p>
                                </div>
                                {l.quantity > l.item.stock && (
                                    <p className="text-xs text-coral mt-1">{t("stock.trade.onlyHave", { count: l.item.stock })}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <aside className="border border-line rounded-lg p-4 h-fit space-y-4">
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.trade.discount")}
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={discount} className="min-h-[44px]" onChange={(e) => setDiscount(e.target.value)} />
                </label>

                <fieldset>
                    <legend className="text-xs text-ash mb-1">{t("stock.trade.paymentMethod")}</legend>
                    <div className="flex flex-wrap gap-2">
                        {METHODS.map((m) => (
                            <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                                className={`min-h-[44px] px-3 rounded-full text-sm border focus-ring ${method === m ? "bg-ink text-paper border-ink" : "border-line text-ink/80"}`}>
                                {t(`stock.trade.method.${m}`)}
                            </button>
                        ))}
                    </div>
                </fieldset>

                {method === "credit" && (
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-ash flex flex-col gap-1">
                            {t("stock.trade.paidNow")}
                            <Input type="number" inputMode="decimal" min="0" step="0.01" value={amountPaid} className="min-h-[44px]" onChange={(e) => setAmountPaid(e.target.value)} />
                        </label>
                        <label className="text-xs text-ash flex flex-col gap-1">
                            {t("stock.trade.paidWith")}
                            <select value={paidVia} onChange={(e) => setPaidVia(e.target.value)}
                                className="border border-line rounded-md px-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                                {MONEY_METHODS.map((m) => <option key={m} value={m}>{t(`stock.trade.method.${m}`)}</option>)}
                            </select>
                        </label>
                    </div>
                )}

                <div>
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("stock.trade.customer")}{method === "credit" ? " *" : ""}
                        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                            className="border border-line rounded-md px-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                            <option value="">{t("stock.trade.walkIn")}</option>
                            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.owed > 0 ? ` (${formatMoney(c.owed)})` : ""}</option>)}
                        </select>
                    </label>
                    {!customerId && method !== "credit" && (
                        <Input type="text" maxLength={120} value={walkIn} placeholder={t("stock.trade.walkInName")} className="mt-2 min-h-[44px]"
                            aria-label={t("stock.trade.walkInName")} onChange={(e) => setWalkIn(e.target.value)} />
                    )}
                    {newCustomer ? (
                        <div className="mt-2 space-y-2">
                            <Input type="text" maxLength={120} value={newCustomer.name} placeholder={t("stock.trade.customerName")} aria-label={t("stock.trade.customerName")}
                                className="min-h-[44px]" onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                            <Input type="tel" maxLength={30} value={newCustomer.phone} placeholder={t("stock.trade.phone")} aria-label={t("stock.trade.phone")}
                                className="min-h-[44px]" onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                            <div className="flex gap-2">
                                <Button type="button" size="sm" className="min-h-[44px]" onClick={addCustomer}>{t("stock.save")}</Button>
                                <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setNewCustomer(null)}>{t("stock.cancel")}</Button>
                            </div>
                        </div>
                    ) : (
                        <Button type="button" variant="ghost" size="sm" className="min-h-[44px] mt-1" onClick={() => setNewCustomer({ name: "", phone: "" })}>{t("stock.trade.addCustomer")}</Button>
                    )}
                </div>

                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.reason")}
                    <Input type="text" maxLength={255} value={note} className="min-h-[44px]" onChange={(e) => setNote(e.target.value)} />
                </label>

                <div>
                    <button type="button" className="text-xs text-ash underline min-h-[44px] focus-ring" onClick={() => setShowDate((v) => !v)} aria-expanded={showDate}>
                        {t("stock.trade.changeDate")}
                    </button>
                    {showDate && (
                        <div>
                            <Input type="datetime-local" value={soldAt} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                                className="min-h-[44px]" aria-label={t("stock.trade.changeDate")} onChange={(e) => setSoldAt(e.target.value)} />
                            <p className="text-xs text-ash mt-1">{t("stock.trade.backdateNote")}</p>
                        </div>
                    )}
                </div>

                <dl className="text-sm space-y-1 border-t border-line pt-3">
                    <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.subtotal")}</dt><dd className="price">{formatMoney(totals.subtotal)}</dd></div>
                    {totals.disc > 0 && <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.discount")}</dt><dd className="price">-{formatMoney(totals.disc)}</dd></div>}
                    <div className="flex justify-between text-base font-medium"><dt>{t("stock.trade.total")}</dt><dd className="price">{formatMoney(totals.total)}</dd></div>
                    {method === "credit" && <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.owed")}</dt><dd className="price">{formatMoney(totals.owed)}</dd></div>}
                </dl>

                <div aria-live="polite">{error && <p className="text-coral text-xs" role="alert">{error}</p>}</div>
                <Button type="submit" size="lg" className="w-full min-h-[48px]" disabled={saving || !lines.length}>
                    {saving ? t("stock.saving") : t("stock.trade.recordSale")}
                </Button>
            </aside>
        </form>
    );
}
