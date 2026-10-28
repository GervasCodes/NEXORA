import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import {
    createStockItem, getStockItem, listItemOnNexora, newRequestId, unlinkStockItem, updateStockItem
} from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import ErrorState from "../../../components/ui/ErrorState";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { SourceBadge } from "./StockItems";
import useStockBase from "./useStockBase";

const EMPTY = { name: "", sku: "", barcode: "", unit: "pcs", cost_price: "", sell_price: "", reorder_level: "", opening_stock: "" };

// Add or edit one item. On an existing item it also holds the per-item switch
// between "Sold on Nexora" and "Outside Nexora" (list / unlink).
export default function StockItemForm() {
    const { t } = useLanguage();
    const toast = useToast();
    const navigate = useNavigate();
    const base = useStockBase();
    const { id } = useParams();
    const isNew = !id;
    const toolsOnly = base === "/business";

    const [form, setForm] = useState(EMPTY);
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [confirm, setConfirm] = useState(null); // "list" | "unlink"
    const keyRef = useRef(newRequestId());

    const fill = (it) => {
        setItem(it);
        setForm({
            name: it.name || "", sku: it.sku || "", barcode: it.barcode || "", unit: it.unit || "pcs",
            cost_price: it.cost_price ?? "", sell_price: it.sell_price ?? "", reorder_level: it.reorder_level ?? "", opening_stock: ""
        });
    };

    useEffect(() => {
        if (isNew) return undefined;
        let cancelled = false;
        setLoading(true);
        getStockItem(id)
            .then((it) => { if (!cancelled) fill(it); })
            .catch((err) => { if (!cancelled) setLoadError(extractErrorMessage(err)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id, isNew]);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const listed = item && item.source === "nexora";

    const payload = () => ({
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        unit: form.unit.trim(),
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
        sell_price: form.sell_price === "" ? undefined : Number(form.sell_price),
        reorder_level: form.reorder_level === "" ? undefined : Number(form.reorder_level)
    });

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!listed && !form.name.trim()) { setError(t("stock.nameRequired")); return; }
        setSaving(true);
        try {
            if (isNew) {
                await createStockItem({
                    ...payload(),
                    opening_stock: form.opening_stock === "" ? undefined : Number(form.opening_stock),
                    idempotency_key: keyRef.current
                });
                toast?.success(t("stock.itemAdded"));
            } else {
                const body = payload();
                if (listed) { delete body.name; delete body.sell_price; }
                await updateStockItem(id, body);
                toast?.success(t("stock.itemSaved"));
            }
            navigate(`${base}/stock`);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const switchSource = async () => {
        setSaving(true);
        setError("");
        try {
            if (confirm === "list") {
                const res = await listItemOnNexora(id);
                toast?.success(t("stock.listed"));
                navigate(`/seller/products/${res.product_id}/edit`);
                return;
            }
            fill(await (async () => { await unlinkStockItem(id); return getStockItem(id); })());
            toast?.success(t("stock.unlinked"));
            setConfirm(null);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (loadError) return <ErrorState title={t("stock.loadError")} hint={loadError} />;
    if (loading) return <Skeleton className="h-64 w-full" />;

    return (
        <form onSubmit={submit} className="max-w-2xl" noValidate>
            <h2 className="font-display text-xl mb-4">{t(isNew ? "stock.form.newTitle" : "stock.form.editTitle")}</h2>

            {listed && (
                <p className="text-sm text-ash border border-line rounded-lg p-3 mb-4">
                    {t("stock.form.listedNote")}{" "}
                    {item.product_id && (
                        <Link className="underline" to={`/seller/products/${item.product_id}/edit`}>{t("stock.form.editProduct")}</Link>
                    )}
                </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-xs text-ash flex flex-col gap-1 sm:col-span-2">{t("stock.f.name")}
                    <Input type="text" maxLength={200} value={form.name} onChange={set("name")} disabled={listed} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.sku")}
                    <Input type="text" maxLength={64} value={form.sku} onChange={set("sku")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.barcode")}
                    <Input type="text" maxLength={64} value={form.barcode} onChange={set("barcode")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.unit")}
                    <Input type="text" maxLength={20} value={form.unit} onChange={set("unit")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.reorderLevel")}
                    <Input type="number" inputMode="numeric" min="0" step="1" value={form.reorder_level} onChange={set("reorder_level")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.costPrice")}
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.cost_price} onChange={set("cost_price")} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.sellPrice")}
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.sell_price} onChange={set("sell_price")} disabled={listed} /></label>
                {isNew && (
                    <label className="text-xs text-ash flex flex-col gap-1">{t("stock.f.openingStock")}
                        <Input type="number" inputMode="numeric" min="0" step="1" value={form.opening_stock} onChange={set("opening_stock")} /></label>
                )}
            </div>

            <div aria-live="polite">{error && <p className="text-coral text-sm mt-3" role="alert">{error}</p>}</div>

            <div className="flex gap-2 mt-5">
                <Button type="submit" className="min-h-[44px]" disabled={saving}>{saving ? t("stock.saving") : t("stock.save")}</Button>
                <Button as={Link} to={`${base}/stock`} variant="ghost" className="min-h-[44px]">{t("stock.cancel")}</Button>
            </div>

            {!isNew && item && (
                <section className="mt-8 border border-line rounded-lg p-4" aria-labelledby="stock-source-title">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 id="stock-source-title" className="text-sm font-medium">{t("stock.source.title")}</h3>
                        <SourceBadge source={item.source} />
                    </div>
                    <p className="text-xs text-ash mb-3">{t(listed ? "stock.source.nexoraHint" : "stock.source.externalHint")}</p>

                    {toolsOnly ? (
                        <p className="text-xs text-ash">{t("stock.source.businessToolsNote")}</p>
                    ) : confirm ? (
                        <div role="group" aria-label={t("stock.source.title")}>
                            <p className="text-sm mb-3">{t(confirm === "list" ? "stock.source.listConfirm" : "stock.source.unlinkConfirm")}</p>
                            <div className="flex gap-2">
                                <Button type="button" size="sm" className="min-h-[44px]" disabled={saving} onClick={switchSource}>
                                    {t(confirm === "list" ? "stock.source.listOnNexora" : "stock.source.unlink")}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setConfirm(null)}>{t("stock.cancel")}</Button>
                            </div>
                        </div>
                    ) : listed ? (
                        item.variant_id ? null : (
                            <Button type="button" size="sm" variant="secondary" className="min-h-[44px]" onClick={() => setConfirm("unlink")}>{t("stock.source.unlink")}</Button>
                        )
                    ) : (
                        <Button type="button" size="sm" variant="secondary" className="min-h-[44px]" onClick={() => setConfirm("list")}>{t("stock.source.listOnNexora")}</Button>
                    )}
                </section>
            )}
        </form>
    );
}
