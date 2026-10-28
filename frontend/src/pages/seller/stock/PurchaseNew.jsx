import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { createPurchase, createSupplier, listSuppliers, newRequestId } from "../../../api/stock";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatMoney } from "../../../utils/format";
import ItemPicker from "./ItemPicker";
import useStockBase from "./useStockBase";

const MONEY_METHODS = ["cash", "mobile_money", "card", "bank_transfer"];
const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const round2 = (n) => Math.round(n * 100) / 100;

// Record goods bought (manunuzi): what, how many, at what unit cost, from whom,
// and how much is already paid. Receiving it adds the stock and updates the
// item's cost price (weighted average).
export default function PurchaseNew() {
    const { t } = useLanguage();
    const toast = useToast();
    const base = useStockBase();
    const navigate = useNavigate();
    const [lines, setLines] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [supplierId, setSupplierId] = useState("");
    const [newSupplier, setNewSupplier] = useState(null);
    const [invoiceNo, setInvoiceNo] = useState("");
    const [paidMode, setPaidMode] = useState("full"); // full | part | none
    const [amountPaid, setAmountPaid] = useState("");
    const [method, setMethod] = useState("cash");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const keyRef = useRef(newRequestId());

    useEffect(() => { listSuppliers({ limit: 100 }).then((d) => setSuppliers(d.items)).catch(() => {}); }, []);

    const add = (item) => setLines((cur) => {
        if (cur.some((l) => l.item.id === item.id)) return cur.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
        return [...cur, { item, quantity: 1, unitCost: item.cost_price !== null ? String(item.cost_price) : "" }];
    });
    const patch = (id, change) => setLines((cur) => cur.map((l) => (l.item.id === id ? { ...l, ...change } : l)));

    const total = useMemo(() => round2(lines.reduce((s, l) => s + (num(l.unitCost) || 0) * (l.quantity || 0), 0)), [lines]);
    const paid = paidMode === "full" ? total : paidMode === "none" ? 0 : Math.min(Math.max(num(amountPaid) || 0, 0), total);

    const addSupplier = async () => {
        if (!newSupplier || !newSupplier.name.trim()) { setError(t("stock.trade.supplierNameNeeded")); return; }
        try {
            const s = await createSupplier({ name: newSupplier.name.trim(), phone: newSupplier.phone?.trim() || undefined });
            setSuppliers((cur) => [...cur, s].sort((a, b) => a.name.localeCompare(b.name)));
            setSupplierId(String(s.id));
            setNewSupplier(null);
            setError("");
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!lines.length) { setError(t("stock.trade.addOneItem")); return; }
        if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || !(num(l.unitCost) >= 0))) { setError(t("stock.trade.checkLines")); return; }
        setSaving(true);
        try {
            const res = await createPurchase({
                lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity, unit_cost: num(l.unitCost) })),
                supplier_id: supplierId ? Number(supplierId) : undefined,
                invoice_no: invoiceNo.trim() || undefined,
                amount_paid: paid,
                payment_method: method,
                note: note.trim() || undefined,
                idempotency_key: keyRef.current
            });
            toast?.success(res.replayed ? t("stock.alreadySaved") : t("stock.trade.purchaseSaved"));
            keyRef.current = newRequestId();
            navigate(`${base}/stock/purchases/${res.purchase.id}`);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_22rem] gap-6">
            <div>
                <ItemPicker onPick={add} priceKind="cost" focusOnMount />
                {lines.length === 0 ? <p className="text-sm text-ash mt-6">{t("stock.trade.emptyPurchase")}</p> : (
                    <ul className="mt-4 divide-y divide-line border border-line rounded-lg">
                        {lines.map((l) => (
                            <li key={l.item.id} className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium min-w-0">{l.item.name}{l.item.variant_label ? <span className="text-ash font-normal"> ({l.item.variant_label})</span> : null}</p>
                                    <Button type="button" variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]"
                                        aria-label={t("stock.trade.removeLine", { name: l.item.name })}
                                        onClick={() => setLines((cur) => cur.filter((x) => x.item.id !== l.item.id))}>×</Button>
                                </div>
                                <div className="grid grid-cols-3 gap-3 mt-2 items-end">
                                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.quantity")}
                                        <Input type="number" inputMode="numeric" min="1" step="1" value={l.quantity} className="min-h-[44px]"
                                            onChange={(e) => patch(l.item.id, { quantity: Math.floor(Number(e.target.value)) || 0 })} /></label>
                                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.unitCost")}
                                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={l.unitCost} className="min-h-[44px]"
                                            onChange={(e) => patch(l.item.id, { unitCost: e.target.value })} /></label>
                                    <p className="text-sm font-medium price pb-3 text-right">{formatMoney((num(l.unitCost) || 0) * l.quantity)}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <aside className="border border-line rounded-lg p-4 h-fit space-y-4">
                <div>
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.supplier")}
                        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                            className="border border-line rounded-md px-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                            <option value="">{t("stock.trade.noSupplier")}</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select></label>
                    {newSupplier ? (
                        <div className="mt-2 space-y-2">
                            <Input type="text" maxLength={120} value={newSupplier.name} placeholder={t("stock.trade.supplierName")} aria-label={t("stock.trade.supplierName")}
                                className="min-h-[44px]" onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
                            <Input type="tel" maxLength={30} value={newSupplier.phone} placeholder={t("stock.trade.phone")} aria-label={t("stock.trade.phone")}
                                className="min-h-[44px]" onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} />
                            <div className="flex gap-2">
                                <Button type="button" size="sm" className="min-h-[44px]" onClick={addSupplier}>{t("stock.save")}</Button>
                                <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setNewSupplier(null)}>{t("stock.cancel")}</Button>
                            </div>
                        </div>
                    ) : <Button type="button" variant="ghost" size="sm" className="min-h-[44px] mt-1" onClick={() => setNewSupplier({ name: "", phone: "" })}>{t("stock.trade.addSupplier")}</Button>}
                </div>

                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.invoiceNo")}
                    <Input type="text" maxLength={60} value={invoiceNo} className="min-h-[44px]" onChange={(e) => setInvoiceNo(e.target.value)} /></label>

                <fieldset>
                    <legend className="text-xs text-ash mb-1">{t("stock.trade.paidStatus")}</legend>
                    <div className="flex flex-wrap gap-2">
                        {["full", "part", "none"].map((m) => (
                            <button key={m} type="button" aria-pressed={paidMode === m} onClick={() => setPaidMode(m)}
                                className={`min-h-[44px] px-3 rounded-full text-sm border focus-ring ${paidMode === m ? "bg-ink text-paper border-ink" : "border-line text-ink/80"}`}>
                                {t(`stock.trade.paidMode.${m}`)}
                            </button>
                        ))}
                    </div>
                    {paidMode === "part" && (
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={amountPaid} aria-label={t("stock.trade.paidNow")}
                            placeholder={t("stock.trade.paidNow")} className="mt-2 min-h-[44px]" onChange={(e) => setAmountPaid(e.target.value)} />
                    )}
                </fieldset>

                {paid > 0 && (
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.paidWith")}
                        <select value={method} onChange={(e) => setMethod(e.target.value)}
                            className="border border-line rounded-md px-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                            {MONEY_METHODS.map((m) => <option key={m} value={m}>{t(`stock.trade.method.${m}`)}</option>)}
                        </select></label>
                )}

                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.reason")}
                    <Input type="text" maxLength={255} value={note} className="min-h-[44px]" onChange={(e) => setNote(e.target.value)} /></label>

                <dl className="text-sm space-y-1 border-t border-line pt-3">
                    <div className="flex justify-between text-base font-medium"><dt>{t("stock.trade.total")}</dt><dd className="price">{formatMoney(total)}</dd></div>
                    <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.paid")}</dt><dd className="price">{formatMoney(paid)}</dd></div>
                    {total - paid > 0 && <div className="flex justify-between"><dt className="text-ash">{t("stock.trade.youOwe")}</dt><dd className="price">{formatMoney(round2(total - paid))}</dd></div>}
                </dl>
                <p className="text-xs text-ash">{t("stock.trade.costNote")}</p>
                <div aria-live="polite">{error && <p className="text-coral text-xs" role="alert">{error}</p>}</div>
                <Button type="submit" size="lg" className="w-full min-h-[48px]" disabled={saving || !lines.length}>{saving ? t("stock.saving") : t("stock.trade.recordPurchase")}</Button>
            </aside>
        </form>
    );
}
