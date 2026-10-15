import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatShortDate, formatDateTime } from "../../utils/format";
import BarChart from "../../components/BarChart";
import PageMeta from "../../components/PageMeta";
import Skeleton from "../../components/Skeleton";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

// Seller POS screens (Round 4, Phase 8): stock levels + adjustments, manual
// off-platform sale entry, stock history, and a combined on/off-platform
// report. Everything here is behind the paid-tier gate on the backend
// (requireSubscriptionTier); the page probes once on mount and shows the
// same upgrade prompt Analytics does when the seller is on Free.

const TABS = ["stock", "sale", "history", "report"];
const PAGE_SIZE = 20;

// One key per form open/submit so a double-tap or a retry after a flaky
// connection can't move stock twice (the server returns the first result).
const newKey = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

const todayString = () => new Date().toISOString().slice(0, 10);
const daysAgoString = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

// <input type="datetime-local"> wants local time without a zone.
const nowLocalInput = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

function Stat({ label, value, mono, highlight }) {
    return (
        <div className={`border rounded-lg p-4 ${highlight ? "border-azure/40 bg-azure/5" : "border-line"}`}>
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-lg font-medium ${mono ? "price" : ""}`}>{value}</p>
        </div>
    );
}

function Pager({ page, total, limit, onPage }) {
    const { t } = useLanguage();
    const pages = Math.max(1, Math.ceil(total / limit));
    if (pages <= 1) return null;
    return (
        <div className="flex items-center justify-between mt-4 text-sm">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                {t("seller.pos.prev")}
            </Button>
            <span className="text-ash">{t("seller.pos.pageOf", { page, pages })}</span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                {t("seller.pos.next")}
            </Button>
        </div>
    );
}

// ---------------------------------------------------------------- Stock

function AdjustPanel({ target, onClose, onSaved }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [value, setValue] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const keyRef = useRef(newKey());

    const isRestock = target.mode === "restock";
    const name = target.variant ? `${target.product.name} (${target.variant.label})` : target.product.name;

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        const number = Number(value);
        if (value === "" || !Number.isInteger(number) || number < (isRestock ? 1 : 0)) {
            setError(t("seller.pos.unitsInvalid"));
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post("/seller/pos/adjustments", {
                product_id: target.product.id,
                variant_id: target.variant ? target.variant.id : undefined,
                type: isRestock ? "restock" : "correction",
                quantity: isRestock ? number : undefined,
                new_stock: isRestock ? undefined : number,
                reason: reason.trim() || undefined,
                idempotency_key: keyRef.current
            });
            toast?.success(data.data?.replayed ? t("seller.pos.alreadySaved") : t("seller.pos.saved"));
            onSaved();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-3 border border-line rounded-lg p-4 bg-line/10">
            <p className="text-sm font-medium mb-3">
                {t(isRestock ? "seller.pos.restockTitle" : "seller.pos.countTitle", { name })}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t(isRestock ? "seller.pos.quantityAdded" : "seller.pos.countedStock")}
                    <Input type="number" inputMode="numeric" min={isRestock ? 1 : 0} step="1" value={value}
                        onChange={(e) => setValue(e.target.value)} autoFocus />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("seller.pos.reason")}
                    <Input type="text" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
            </div>
            {error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}
            <div className="flex gap-2 mt-3">
                <Button type="submit" size="sm" disabled={saving}>
                    {saving ? t("seller.pos.saving") : t("seller.pos.save")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t("seller.pos.cancel")}</Button>
            </div>
        </form>
    );
}

function StockBadge({ stock, threshold }) {
    const { t } = useLanguage();
    if (stock <= 0) {
        return <span className="text-xs px-2 py-0.5 rounded-full bg-coral/10 text-coral">{t("seller.pos.outOfStock")}</span>;
    }
    return (
        <span className="text-xs text-ash whitespace-nowrap">
            {t("seller.pos.inStock", { count: stock })}
            {stock <= threshold && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-mango/15 text-mango-dark">{t("seller.pos.lowBadge")}</span>
            )}
        </span>
    );
}

// Business-tools-only accounts (migration 146) keep their own inventory here:
// items are hidden products that never appear on the marketplace.
function AddItemForm({ onAdded }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!name.trim() || price === "") { setError(t("business.itemRequired")); return; }
        setSaving(true);
        try {
            await api.post("/seller/pos/items", {
                name: name.trim(),
                price: Number(price),
                initial_stock: stock === "" ? undefined : Number(stock)
            });
            toast?.success(t("business.itemAdded"));
            setName(""); setPrice(""); setStock("");
            onAdded();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-6">
            <p className="text-sm font-medium">{t("business.addItem")}</p>
            <p className="text-xs text-ash mb-3">{t("business.addItemHint")}</p>
            <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-xs text-ash flex flex-col gap-1">{t("business.itemName")}
                    <Input type="text" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("business.itemPrice")}
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("business.openingStock")}
                    <Input type="number" inputMode="numeric" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></label>
            </div>
            {error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}
            <Button type="submit" size="sm" className="mt-3" disabled={saving}>
                {saving ? t("seller.pos.saving") : t("business.addItem")}
            </Button>
        </form>
    );
}

function EditItemPanel({ product, onClose, onSaved }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [name, setName] = useState(product.name);
    const [price, setPrice] = useState(String(product.price));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!name.trim() || price === "") { setError(t("business.itemRequired")); return; }
        setSaving(true);
        try {
            await api.put(`/seller/pos/items/${product.id}`, { name: name.trim(), price: Number(price) });
            toast?.success(t("business.itemUpdated"));
            onSaved();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-3 border border-line rounded-lg p-4 bg-line/10">
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-ash flex flex-col gap-1">{t("business.itemName")}
                    <Input type="text" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("business.itemPrice")}
                    <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            </div>
            {error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}
            <div className="flex gap-2 mt-3">
                <Button type="submit" size="sm" disabled={saving}>{saving ? t("seller.pos.saving") : t("seller.pos.save")}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t("seller.pos.cancel")}</Button>
            </div>
        </form>
    );
}

function StockTab({ refreshSignal, onChanged, toolsOnly }) {
    const { t } = useLanguage();
    const [editingId, setEditingId] = useState(null);
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [lowOnly, setLowOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [adjusting, setAdjusting] = useState(null);

    useEffect(() => {
        const id = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
        return () => clearTimeout(id);
    }, [search]);

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        api.get("/seller/pos/stock", {
            params: { q: debounced || undefined, low_stock: lowOnly ? 1 : undefined, page, limit: PAGE_SIZE }
        })
            .then(({ data: res }) => setData(res.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, [debounced, lowOnly, page]);

    useEffect(load, [load, refreshSignal]);

    const handleSaved = () => { setAdjusting(null); setEditingId(null); load(); onChanged(); };
    const isAdjusting = (productId, variantId, mode) =>
        adjusting && adjusting.product.id === productId
        && (adjusting.variant ? adjusting.variant.id : null) === variantId && adjusting.mode === mode;

    if (error) return <ErrorState title={t("seller.pos.loadError")} hint={error} onRetry={load} />;

    return (
        <div>
            {toolsOnly && <AddItemForm onAdded={handleSaved} />}

            {data && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <Stat label={t("seller.pos.statProducts")} value={data.summary.products} />
                    <Stat label={t("seller.pos.statLow")} value={data.summary.low_stock} />
                    <Stat label={t("seller.pos.statOut")} value={data.summary.out_of_stock} />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex-1 min-w-[12rem]">
                    <Input type="search" placeholder={t("seller.pos.searchPlaceholder")} value={search}
                        onChange={(e) => setSearch(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={lowOnly}
                        onChange={(e) => { setLowOnly(e.target.checked); setPage(1); }} />
                    {t("seller.pos.lowOnly")}
                </label>
            </div>

            {loading && !data ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
            ) : data.items.length === 0 ? (
                <EmptyState title={t("seller.pos.noProducts")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((p) => (
                        <li key={p.id} className="p-4">
                            <div className="flex items-center gap-3">
                                {p.image_url ? (
                                    <img src={p.image_url} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" loading="lazy" />
                                ) : (
                                    <div className="w-10 h-10 rounded-md bg-line/40 shrink-0" aria-hidden="true" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{p.name}</p>
                                    <p className="text-xs text-ash">
                                        {p.has_variants && <>{t("seller.pos.variantsCount", { count: p.variants.length })} · </>}
                                        {!p.is_active && !toolsOnly && <>{t("seller.pos.inactive")} · </>}
                                        <span className="price">{formatMoney(p.price)}</span>
                                    </p>
                                </div>
                                <StockBadge stock={p.stock} threshold={data.threshold} />
                                {!p.has_variants && (
                                    <div className="flex gap-2 shrink-0">
                                        <Button size="sm" variant="secondary"
                                            onClick={() => setAdjusting({ product: p, variant: null, mode: "restock" })}>
                                            {t("seller.pos.restock")}
                                        </Button>
                                        <Button size="sm" variant="ghost"
                                            onClick={() => setAdjusting({ product: p, variant: null, mode: "count" })}>
                                            {t("seller.pos.count")}
                                        </Button>
                                        {toolsOnly && (
                                            <Button size="sm" variant="ghost"
                                                onClick={() => setEditingId(editingId === p.id ? null : p.id)}>
                                                {t("business.editItem")}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {toolsOnly && editingId === p.id && (
                                <EditItemPanel product={p} onClose={() => setEditingId(null)} onSaved={handleSaved} />
                            )}

                            {!p.has_variants && (isAdjusting(p.id, null, "restock") || isAdjusting(p.id, null, "count")) && (
                                <AdjustPanel key={adjusting.mode} target={adjusting}
                                    onClose={() => setAdjusting(null)} onSaved={handleSaved} />
                            )}

                            {p.has_variants && (
                                <ul className="mt-3 ml-[3.25rem] space-y-2">
                                    {p.variants.map((v) => (
                                        <li key={v.id}>
                                            <div className="flex items-center gap-3 text-sm">
                                                <span className="flex-1 min-w-0 truncate">{v.label || `#${v.id}`}</span>
                                                <StockBadge stock={v.stock} threshold={data.threshold} />
                                                <div className="flex gap-2 shrink-0">
                                                    <Button size="sm" variant="secondary"
                                                        onClick={() => setAdjusting({ product: p, variant: v, mode: "restock" })}>
                                                        {t("seller.pos.restock")}
                                                    </Button>
                                                    <Button size="sm" variant="ghost"
                                                        onClick={() => setAdjusting({ product: p, variant: v, mode: "count" })}>
                                                        {t("seller.pos.count")}
                                                    </Button>
                                                </div>
                                            </div>
                                            {(isAdjusting(p.id, v.id, "restock") || isAdjusting(p.id, v.id, "count")) && (
                                                <AdjustPanel key={`${v.id}-${adjusting.mode}`} target={adjusting}
                                                    onClose={() => setAdjusting(null)} onSaved={handleSaved} />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {data && <Pager page={page} total={data.total} limit={PAGE_SIZE} onPage={setPage} />}
        </div>
    );
}

// ------------------------------------------------------------ Record sale

const PAYMENT_METHODS = [
    ["cash", "pmCash"], ["mobile_money", "pmMobile"], ["card", "pmCard"], ["bank_transfer", "pmBank"], ["other", "pmOther"]
];

function ProductPicker({ onPick }) {
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);

    useEffect(() => {
        const q = query.trim();
        if (!q) { setResults([]); return undefined; }
        const id = setTimeout(() => {
            api.get("/seller/pos/stock", { params: { q, limit: 8 } })
                .then(({ data }) => setResults(data.data.items))
                .catch(() => setResults([]));
        }, 300);
        return () => clearTimeout(id);
    }, [query]);

    return (
        <div>
            <Input type="search" placeholder={t("seller.pos.chooseProduct")} value={query}
                onChange={(e) => setQuery(e.target.value)} />
            {results.length > 0 && (
                <ul className="border border-line rounded-md mt-1 divide-y divide-line max-h-64 overflow-auto">
                    {results.map((p) => (
                        <li key={p.id}>
                            <button type="button" onClick={() => onPick(p)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-line/30 flex justify-between gap-3">
                                <span className="truncate">{p.name}</span>
                                <span className="text-ash whitespace-nowrap">{t("seller.pos.inStock", { count: p.stock })}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function SaleTab({ refreshSignal, onChanged }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [product, setProduct] = useState(null);
    const [variantId, setVariantId] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [unitPrice, setUnitPrice] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [customer, setCustomer] = useState("");
    const [note, setNote] = useState("");
    const [soldAt, setSoldAt] = useState(nowLocalInput());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const keyRef = useRef(newKey());

    const [recent, setRecent] = useState(null);
    const loadRecent = useCallback(() => {
        api.get("/seller/pos/sales", { params: { limit: 10 } })
            .then(({ data }) => setRecent(data.data.items))
            .catch(() => setRecent([]));
    }, []);
    useEffect(loadRecent, [loadRecent, refreshSignal]);

    const variant = useMemo(
        () => (product && product.has_variants ? product.variants.find((v) => String(v.id) === String(variantId)) : null),
        [product, variantId]
    );
    const defaultPrice = product ? product.price + (variant ? variant.price_delta : 0) : 0;

    // Pre-fill the price from the product (or chosen variant); the seller
    // can still overwrite it, e.g. after bargaining in person.
    useEffect(() => {
        if (product && (!product.has_variants || variant)) setUnitPrice(String(defaultPrice));
    }, [product, variant, defaultPrice]);

    const availableStock = product ? (product.has_variants ? (variant ? variant.stock : null) : product.stock) : null;
    const total = (Number(unitPrice) || 0) * (Number(quantity) || 0);

    const reset = () => {
        setProduct(null); setVariantId(""); setQuantity("1"); setUnitPrice("");
        setCustomer(""); setNote(""); setSoldAt(nowLocalInput()); setError("");
        keyRef.current = newKey();
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        const qty = Number(quantity);
        if (!Number.isInteger(qty) || qty < 1) { setError(t("seller.pos.qtyInvalid")); return; }
        if (product.has_variants && !variant) { setError(t("seller.pos.chooseVariant")); return; }

        setSaving(true);
        try {
            const { data } = await api.post("/seller/pos/sales", {
                product_id: product.id,
                variant_id: variant ? variant.id : undefined,
                quantity: qty,
                unit_price: unitPrice === "" ? undefined : Number(unitPrice),
                payment_method: paymentMethod,
                customer_name: customer.trim() || undefined,
                note: note.trim() || undefined,
                sold_at: soldAt ? new Date(soldAt).toISOString() : undefined,
                idempotency_key: keyRef.current
            });
            toast?.success(data.data?.replayed ? t("seller.pos.alreadySaved") : t("seller.pos.recorded"));
            reset();
            loadRecent();
            onChanged();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid lg:grid-cols-2 gap-8">
            <form onSubmit={submit} className="border border-line rounded-lg p-5 space-y-4 self-start">
                <div>
                    <h2 className="font-display text-lg">{t("seller.pos.saleTitle")}</h2>
                    <p className="text-xs text-ash mt-1">{t("seller.pos.saleHint")}</p>
                </div>

                <div>
                    <p className="text-xs text-ash mb-1">{t("seller.pos.product")}</p>
                    {product ? (
                        <div className="flex items-center justify-between border border-line rounded-md px-3 py-2 text-sm">
                            <span className="truncate pr-3">{product.name}</span>
                            <button type="button" className="text-azure text-xs" onClick={() => { setProduct(null); setVariantId(""); setUnitPrice(""); }}>
                                {t("seller.pos.change")}
                            </button>
                        </div>
                    ) : (
                        <ProductPicker onPick={(p) => { setProduct(p); setVariantId(""); }} />
                    )}
                </div>

                {product && product.has_variants && (
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("seller.pos.variant")}
                        <select className="border border-line rounded-md px-3 py-2 text-sm text-ink bg-transparent focus-ring"
                            value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                            <option value="">{t("seller.pos.chooseVariant")}</option>
                            {product.variants.map((v) => (
                                <option key={v.id} value={v.id}>{v.label || `#${v.id}`} ({t("seller.pos.inStock", { count: v.stock })})</option>
                            ))}
                        </select>
                    </label>
                )}

                {product && availableStock !== null && (
                    <p className="text-xs text-ash">{t("seller.pos.inStock", { count: availableStock })}</p>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("seller.pos.quantity")}
                        <Input type="number" inputMode="numeric" min="1" step="1" value={quantity}
                            onChange={(e) => setQuantity(e.target.value)} />
                    </label>
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("seller.pos.unitPrice")}
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={unitPrice}
                            onChange={(e) => setUnitPrice(e.target.value)} />
                    </label>
                </div>

                <p className="text-sm">
                    {t("seller.pos.total")}: <span className="price font-medium">{formatMoney(total)}</span>
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("seller.pos.paymentMethod")}
                        <select className="border border-line rounded-md px-3 py-2 text-sm text-ink bg-transparent focus-ring"
                            value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                            {PAYMENT_METHODS.map(([value, key]) => (
                                <option key={value} value={value}>{t(`seller.pos.${key}`)}</option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("seller.pos.soldAt")}
                        <Input type="datetime-local" max={nowLocalInput()} value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
                    </label>
                </div>

                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("seller.pos.customer")}
                    <Input type="text" maxLength={120} value={customer} onChange={(e) => setCustomer(e.target.value)} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("seller.pos.note")}
                    <Input type="text" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>

                {error && <p className="text-coral text-sm" role="alert">{error}</p>}

                <Button type="submit" disabled={saving || !product}>
                    {saving ? t("seller.pos.saving") : t("seller.pos.record")}
                </Button>
            </form>

            <div>
                <h2 className="font-display text-lg mb-3">{t("seller.pos.recentSales")}</h2>
                {recent === null ? (
                    <Skeleton className="h-24 w-full" />
                ) : recent.length === 0 ? (
                    <p className="text-sm text-ash">{t("seller.pos.noSales")}</p>
                ) : (
                    <ul className="divide-y divide-line border border-line rounded-lg">
                        {recent.map((s) => (
                            <li key={s.id} className="p-3 text-sm flex justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate">
                                        {s.quantity} × {s.product_name}{s.variant_label ? ` (${s.variant_label})` : ""}
                                    </p>
                                    <p className="text-xs text-ash">
                                        {formatDateTime(s.sold_at)}{s.customer_name ? ` · ${s.customer_name}` : ""}
                                    </p>
                                </div>
                                <span className="price whitespace-nowrap">{formatMoney(s.total_amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- History

function HistoryTab({ refreshSignal }) {
    const { t } = useLanguage();
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setError("");
        api.get("/seller/pos/adjustments", { params: { type: type || undefined, page, limit: PAGE_SIZE } })
            .then(({ data: res }) => setData(res.data))
            .catch((err) => setError(extractErrorMessage(err)));
    }, [type, page]);
    useEffect(load, [load, refreshSignal]);

    const typeLabel = { restock: "typeRestock", correction: "typeCorrection", offline_sale: "typeSale" };

    if (error) return <ErrorState title={t("seller.pos.loadError")} hint={error} onRetry={load} />;

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-lg">{t("seller.pos.historyTitle")}</h2>
                <select className="border border-line rounded-md px-3 py-2 text-sm text-ink bg-transparent focus-ring"
                    value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                    <option value="">{t("seller.pos.allTypes")}</option>
                    <option value="restock">{t("seller.pos.typeRestock")}</option>
                    <option value="correction">{t("seller.pos.typeCorrection")}</option>
                    <option value="offline_sale">{t("seller.pos.typeSale")}</option>
                </select>
            </div>
            <p className="text-xs text-ash mb-4">{t("seller.pos.historyNote")}</p>

            {!data ? (
                <Skeleton className="h-40 w-full" />
            ) : data.items.length === 0 ? (
                <EmptyState title={t("seller.pos.noHistory")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((a) => (
                        <li key={a.id} className="p-3 text-sm flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate">{a.product_name}</p>
                                <p className="text-xs text-ash">
                                    {t(`seller.pos.${typeLabel[a.type]}`)} · {formatDateTime(a.created_at)}
                                    {a.reason ? ` · ${a.reason}` : ""}
                                </p>
                            </div>
                            <div className="text-right whitespace-nowrap">
                                <p className={a.quantity_change > 0 ? "text-teal font-medium" : "text-coral font-medium"}>
                                    {a.quantity_change > 0 ? "+" : ""}{a.quantity_change}
                                </p>
                                <p className="text-xs text-ash">{a.stock_before} → {a.stock_after}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {data && <Pager page={page} total={data.total} limit={PAGE_SIZE} onPage={setPage} />}
        </div>
    );
}

// ----------------------------------------------------------------- Report

function ReportTab({ refreshSignal }) {
    const { t } = useLanguage();
    const [from, setFrom] = useState(daysAgoString(29));
    const [to, setTo] = useState(todayString());
    const [applied, setApplied] = useState({ from: daysAgoString(29), to: todayString() });
    const [rangeError, setRangeError] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setError("");
        api.get("/seller/pos/report", { params: applied })
            .then(({ data: res }) => setData(res.data))
            .catch((err) => setError(extractErrorMessage(err)));
    }, [applied]);
    useEffect(load, [load, refreshSignal]);

    const apply = () => {
        if (!from || !to || new Date(to) < new Date(from)) {
            setRangeError(t("seller.pos.dateRangeError"));
            return;
        }
        setRangeError("");
        setApplied({ from, to });
    };

    const chartData = useMemo(
        () => (data ? data.daily.map((d) => ({ day: formatShortDate(d.day), total: d.on_platform + d.off_platform })) : []),
        [data]
    );

    if (error) return <ErrorState title={t("seller.pos.loadError")} hint={error} onRetry={load} />;

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-6">
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("seller.pos.reportFrom")}
                    <Input type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("seller.pos.reportTo")}
                    <Input type="date" min={from} max={todayString()} value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
                <Button size="sm" onClick={apply}>{t("seller.pos.apply")}</Button>
                {rangeError && <p className="text-coral text-xs" role="alert">{rangeError}</p>}
            </div>

            {!data ? (
                <Skeleton className="h-48 w-full" />
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        <Stat label={t("seller.pos.revenueCombined")} value={formatMoney(data.combined.revenue)} mono highlight />
                        <Stat label={t("seller.pos.revenueOnPlatform")} value={formatMoney(data.on_platform.revenue)} mono />
                        <Stat label={t("seller.pos.revenueOffPlatform")} value={formatMoney(data.off_platform.revenue)} mono />
                        <Stat label={t("seller.pos.unitsSold")} value={data.combined.units} />
                    </div>

                    {data.combined.sales_count === 0 ? (
                        <EmptyState title={t("seller.pos.noReportData")} />
                    ) : (
                        <>
                            <div className="border border-line rounded-lg p-4 mb-8">
                                <p className="text-sm font-medium mb-4">{t("seller.pos.dailyTitle")}</p>
                                <BarChart data={chartData} labelKey="day" valueKey="total" formatValue={formatMoney} />
                            </div>

                            <p className="text-sm font-medium mb-3">{t("seller.pos.byProduct")}</p>
                            <div className="overflow-x-auto border border-line rounded-lg">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-ash border-b border-line">
                                            <th className="p-3 font-medium">{t("seller.pos.product")}</th>
                                            <th className="p-3 font-medium text-right">{t("seller.pos.colOnUnits")}</th>
                                            <th className="p-3 font-medium text-right">{t("seller.pos.colOnRevenue")}</th>
                                            <th className="p-3 font-medium text-right">{t("seller.pos.colOffUnits")}</th>
                                            <th className="p-3 font-medium text-right">{t("seller.pos.colOffRevenue")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.by_product.map((row) => (
                                            <tr key={row.product_id} className="border-b border-line last:border-0">
                                                <td className="p-3 max-w-[16rem] truncate">{row.name}</td>
                                                <td className="p-3 text-right">{row.on_platform_units}</td>
                                                <td className="p-3 text-right price">{formatMoney(row.on_platform_revenue)}</td>
                                                <td className="p-3 text-right">{row.off_platform_units}</td>
                                                <td className="p-3 text-right price">{formatMoney(row.off_platform_revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-ash mt-3">{t("seller.pos.reportNote")}</p>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ------------------------------------------------------------------- Page

export default function SellerBusinessTools() {
    const { t } = useLanguage();
    const { user } = useAuth();
    const toolsOnly = user?.seller_mode === "business_tools";
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get("tab");
    const tab = TABS.includes(requested) ? requested : "stock";

    // gate: null = still probing, "locked" = Free plan, "open" = allowed.
    const [gate, setGate] = useState(null);
    const [probeError, setProbeError] = useState("");
    // Bumped whenever stock/sales change so the other tabs refetch.
    const [refreshSignal, setRefreshSignal] = useState(0);
    const bump = useCallback(() => setRefreshSignal((n) => n + 1), []);

    const probe = useCallback(() => {
        setGate(null);
        setProbeError("");
        api.get("/seller/pos/stock", { params: { limit: 1 } })
            .then(() => setGate("open"))
            .catch((err) => {
                if (err.response?.data?.code === "SUBSCRIPTION_REQUIRED") setGate("locked");
                else setProbeError(extractErrorMessage(err));
            });
    }, []);
    useEffect(probe, [probe]);

    const tabLabels = {
        stock: t("seller.pos.tabStock"),
        sale: t("seller.pos.tabSale"),
        history: t("seller.pos.tabHistory"),
        report: t("seller.pos.tabReport")
    };

    const header = (
        <>
            <PageMeta title={t("seller.pos.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.pos.title")}</h1>
            <p className="text-ash text-sm mb-6">{t("seller.pos.subtitle")}</p>
        </>
    );

    if (probeError) {
        return <div>{header}<ErrorState title={t("seller.pos.loadError")} hint={probeError} onRetry={probe} /></div>;
    }

    if (gate === "locked") {
        return (
            <div>
                {header}
                <div className="max-w-md glass-strong rounded-lg p-5">
                    <h2 className="font-display text-lg mb-1">{t("seller.pos.gateTitle")}</h2>
                    <p className="text-sm text-ash mb-4">{t("seller.pos.gateBody")}</p>
                    <Link to={toolsOnly ? "/business/plan" : "/seller/subscription"}
                        className="inline-block w-full text-center bg-ink text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
                        {t("seller.pos.gateCta")}
                    </Link>
                </div>
            </div>
        );
    }

    if (gate === null) {
        return (
            <div>
                {header}
                <Skeleton className="h-10 w-full mb-4" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {header}
            <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto" role="tablist">
                {TABS.map((key) => (
                    <button key={key} type="button" role="tab" aria-selected={tab === key}
                        onClick={() => setSearchParams(key === "stock" ? {} : { tab: key }, { replace: true })}
                        className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                            tab === key ? "border-ink text-ink font-medium" : "border-transparent text-ash hover:text-ink"
                        }`}>
                        {tabLabels[key]}
                    </button>
                ))}
            </div>

            {tab === "stock" && <StockTab refreshSignal={refreshSignal} onChanged={bump} toolsOnly={toolsOnly} />}
            {tab === "sale" && <SaleTab refreshSignal={refreshSignal} onChanged={bump} />}
            {tab === "history" && <HistoryTab refreshSignal={refreshSignal} />}
            {tab === "report" && <ReportTab refreshSignal={refreshSignal} />}
        </div>
    );
}
