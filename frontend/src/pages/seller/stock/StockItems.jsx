import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import {
    adjustStockItem, archiveStockItem, listStockItems, newRequestId, reconcileStock, unarchiveStockItem
} from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

const PAGE_SIZE = 20;
const FILTERS = ["all", "nexora", "external", "low"];

export function SourceBadge({ source }) {
    const { t } = useLanguage();
    const nexora = source === "nexora";
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${nexora ? "bg-azure/10 text-azure" : "bg-line/60 text-ink/80"}`}>
            {t(nexora ? "stock.badgeNexora" : "stock.badgeExternal")}
        </span>
    );
}

function StockLevel({ item }) {
    const { t } = useLanguage();
    if (item.is_out) {
        return <span className="text-xs px-2 py-0.5 rounded-full bg-coral/10 text-coral">{t("stock.out")}</span>;
    }
    return (
        <span className="text-sm text-ink/80 whitespace-nowrap">
            {t("stock.inStock", { count: item.stock })}
            {item.is_low && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-mango/15 text-mango-dark">{t("stock.low")}</span>}
        </span>
    );
}

function AdjustPanel({ item, mode, onClose, onSaved }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [value, setValue] = useState("");
    const [cost, setCost] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const keyRef = useRef(newRequestId());
    const isAdd = mode === "add";
    const name = item.variant_label ? `${item.name} (${item.variant_label})` : item.name;

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        const n = Number(value);
        if (value === "" || !Number.isInteger(n) || n < (isAdd ? 1 : 0)) {
            setError(t("stock.unitsInvalid"));
            return;
        }
        setSaving(true);
        try {
            const res = await adjustStockItem(item.id, {
                type: isAdd ? "purchase" : "correction",
                quantity: isAdd ? n : undefined,
                new_stock: isAdd ? undefined : n,
                // What this screen showed: the server applies only our change on top
                // of any sale that happened since.
                baseline: isAdd ? undefined : item.stock,
                unit_cost: isAdd && cost !== "" ? Number(cost) : undefined,
                reason: reason.trim() || undefined,
                idempotency_key: keyRef.current
            });
            toast?.success(res.data?.replayed ? t("stock.alreadySaved") : t("stock.saved"));
            onSaved();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-3 border border-line rounded-lg p-4 bg-line/10">
            <p className="text-sm font-medium mb-3">{t(isAdd ? "stock.addStockTitle" : "stock.countTitle", { name })}</p>
            <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t(isAdd ? "stock.quantityAdded" : "stock.countedStock")}
                    <Input type="number" inputMode="numeric" min={isAdd ? 1 : 0} step="1" value={value}
                        onChange={(e) => setValue(e.target.value)} />
                </label>
                {isAdd && (
                    <label className="text-xs text-ash flex flex-col gap-1">
                        {t("stock.unitCost")}
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
                    </label>
                )}
                <label className="text-xs text-ash flex flex-col gap-1">
                    {t("stock.reason")}
                    <Input type="text" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
            </div>
            <div aria-live="polite">
                {error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}
            </div>
            <div className="flex gap-2 mt-3">
                <Button type="submit" size="sm" className="min-h-[44px]" disabled={saving}>{saving ? t("stock.saving") : t("stock.save")}</Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={onClose}>{t("stock.cancel")}</Button>
            </div>
        </form>
    );
}

function LedgerCheck() {
    const { t } = useLanguage();
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    const run = async () => {
        setBusy(true);
        try {
            setState(await reconcileStock());
        } catch (err) {
            setState({ error: extractErrorMessage(err) });
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mt-8 text-sm">
            <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={run} disabled={busy}>{t("stock.reconcileCheck")}</Button>
            <span aria-live="polite" className="ml-2 text-ash">
                {state?.error || (state && (state.ok ? t("stock.reconcileOk") : t("stock.reconcileDrift", { count: state.drift.length })))}
            </span>
        </div>
    );
}

export default function StockItems() {
    const { t } = useLanguage();
    const toast = useToast();
    const base = useStockBase();
    const [filter, setFilter] = useState("all");
    const [q, setQ] = useState("");
    const [search, setSearch] = useState("");
    const [archived, setArchived] = useState(false);
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [panel, setPanel] = useState(null); // { id, mode }

    useEffect(() => {
        const id = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 300);
        return () => clearTimeout(id);
    }, [q]);

    const load = useCallback(() => {
        setError("");
        listStockItems({
            page, limit: PAGE_SIZE, q: search || undefined, archived: archived ? 1 : undefined,
            source: filter === "nexora" || filter === "external" ? filter : undefined,
            low: filter === "low" ? 1 : undefined
        })
            .then(setData)
            .catch((err) => setError(extractErrorMessage(err)));
    }, [page, search, archived, filter]);
    useEffect(load, [load]);

    const toggleArchive = async (item) => {
        try {
            await (item.is_archived ? unarchiveStockItem(item.id) : archiveStockItem(item.id));
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        }
    };

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;

    const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <label className="flex-1 min-w-[12rem] text-xs text-ash flex flex-col gap-1">
                    {t("stock.search")}
                    <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <Button as={Link} to={`${base}/stock/items/new`} className="min-h-[44px]">{t("stock.addItem")}</Button>
            </div>

            {data && (
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.statItems")}</dt><dd className="text-lg font-medium">{data.summary.items}</dd></div>
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.statLow")}</dt><dd className="text-lg font-medium">{data.summary.low_stock}</dd></div>
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.statOut")}</dt><dd className="text-lg font-medium">{data.summary.out_of_stock}</dd></div>
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.statValue")}</dt><dd className="text-lg font-medium price">{formatMoney(data.summary.stock_value_at_cost)}</dd></div>
                </dl>
            )}

            <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t("stock.tabItems")}>
                {FILTERS.map((key) => (
                    <button key={key} type="button" aria-pressed={filter === key}
                        onClick={() => { setFilter(key); setPage(1); }}
                        className={`min-h-[44px] px-4 rounded-full text-sm border focus-ring ${filter === key ? "bg-ink text-paper border-ink" : "border-line text-ink/80"}`}>
                        {t(`stock.filter.${key}`)}
                    </button>
                ))}
                <label className="inline-flex items-center gap-2 min-h-[44px] px-2 text-sm text-ash">
                    <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1); }} />
                    {t("stock.showArchived")}
                </label>
            </div>

            {!data ? (
                <div aria-busy="true"><Skeleton className="h-16 w-full mb-2" /><Skeleton className="h-16 w-full mb-2" /><Skeleton className="h-16 w-full" /></div>
            ) : data.items.length === 0 ? (
                <EmptyState title={t("stock.emptyTitle")} hint={t("stock.emptyBody")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((item) => (
                        <li key={item.id} className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-medium truncate">
                                        {item.name}{item.variant_label ? <span className="text-ash font-normal"> ({item.variant_label})</span> : null}
                                    </p>
                                    <p className="text-xs text-ash mt-0.5">
                                        {[item.sku, item.barcode].filter(Boolean).join(" · ")}
                                        {item.sell_price > 0 && <span className="price"> {formatMoney(item.sell_price)}</span>}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <SourceBadge source={item.source} />
                                    <StockLevel item={item} />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                                <Button size="sm" variant="secondary" className="min-h-[44px]" onClick={() => setPanel({ id: item.id, mode: "add" })}>{t("stock.addStock")}</Button>
                                <Button size="sm" variant="secondary" className="min-h-[44px]" onClick={() => setPanel({ id: item.id, mode: "count" })}>{t("stock.countStock")}</Button>
                                <Button as={Link} to={`${base}/stock/items/${item.id}`} size="sm" variant="ghost" className="min-h-[44px]">{t("stock.edit")}</Button>
                                <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => toggleArchive(item)}>
                                    {t(item.is_archived ? "stock.unarchive" : "stock.archive")}
                                </Button>
                            </div>
                            {panel && panel.id === item.id && (
                                <AdjustPanel item={item} mode={panel.mode} onClose={() => setPanel(null)}
                                    onSaved={() => { setPanel(null); load(); }} />
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm">
                    <Button variant="secondary" size="sm" className="min-h-[44px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("seller.pos.prev")}</Button>
                    <span className="text-ash">{t("seller.pos.pageOf", { page, pages })}</span>
                    <Button variant="secondary" size="sm" className="min-h-[44px]" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("seller.pos.next")}</Button>
                </div>
            )}

            <LedgerCheck />
        </div>
    );
}
