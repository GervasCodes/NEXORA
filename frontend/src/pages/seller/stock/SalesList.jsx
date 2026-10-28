import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { listSales } from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { formatDateTime, formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

const PAGE_SIZE = 20;

export default function SalesList() {
    const { t } = useLanguage();
    const base = useStockBase();
    const [status, setStatus] = useState("all");
    const [owing, setOwing] = useState(false);
    const [q, setQ] = useState("");
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const id = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 300);
        return () => clearTimeout(id);
    }, [q]);

    const load = useCallback(() => {
        setError("");
        listSales({
            page, limit: PAGE_SIZE, q: search || undefined, status: status === "all" ? undefined : status,
            owing: owing ? 1 : undefined, from: from || undefined, to: to || undefined
        }).then(setData).catch((err) => setError(extractErrorMessage(err)));
    }, [page, search, status, owing, from, to]);
    useEffect(load, [load]);

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;
    const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <label className="flex-1 min-w-[12rem] text-xs text-ash flex flex-col gap-1">
                    {t("stock.trade.searchSales")}
                    <Input type="search" value={q} className="min-h-[44px]" onChange={(e) => setQ(e.target.value)} />
                </label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.from")}
                    <Input type="date" value={from} className="min-h-[44px]" onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
                <label className="text-xs text-ash flex flex-col gap-1">{t("stock.trade.to")}
                    <Input type="date" value={to} className="min-h-[44px]" onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
                <Button as={Link} to={`${base}/stock/sell`} className="min-h-[44px]">{t("stock.trade.newSale")}</Button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t("stock.trade.tabSales")}>
                {["all", "active", "voided"].map((k) => (
                    <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setPage(1); }}
                        className={`min-h-[44px] px-4 rounded-full text-sm border focus-ring ${status === k ? "bg-ink text-paper border-ink" : "border-line text-ink/80"}`}>
                        {t(`stock.trade.status.${k}`)}
                    </button>
                ))}
                <label className="inline-flex items-center gap-2 min-h-[44px] px-2 text-sm text-ash">
                    <input type="checkbox" checked={owing} onChange={(e) => { setOwing(e.target.checked); setPage(1); }} />
                    {t("stock.trade.onlyOwing")}
                </label>
            </div>

            {data && (
                <dl className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.trade.netSales")}</dt><dd className="text-lg font-medium price">{formatMoney(data.summary.net_total)}</dd></div>
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.trade.owedToYou")}</dt><dd className="text-lg font-medium price">{formatMoney(data.summary.owed)}</dd></div>
                </dl>
            )}

            {!data ? (
                <div aria-busy="true"><Skeleton className="h-16 w-full mb-2" /><Skeleton className="h-16 w-full" /></div>
            ) : data.items.length === 0 ? (
                <EmptyState title={t("stock.trade.noSales")} hint={t("stock.trade.noSalesHint")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((s) => (
                        <li key={s.id}>
                            <Link to={`${base}/stock/sales/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 min-h-[56px] hover:bg-line/20 focus-ring">
                                <span className="min-w-0">
                                    <span className="block font-medium">{s.receipt_no}{s.source === "legacy" ? <span className="text-xs text-ash font-normal"> · {t("stock.trade.legacy")}</span> : null}</span>
                                    <span className="block text-xs text-ash">{formatDateTime(s.sold_at)}{s.customer_name ? ` · ${s.customer_name}` : ""} · {t("stock.trade.method." + s.payment_method)}</span>
                                </span>
                                <span className="text-right">
                                    <span className={`block price font-medium ${s.status === "voided" ? "line-through text-ash" : ""}`}>{formatMoney(s.net_amount)}</span>
                                    {s.status === "voided" && <span className="text-xs text-coral">{t("stock.trade.cancelled")}</span>}
                                    {s.balance > 0 && <span className="text-xs text-mango-dark">{t("stock.trade.owes", { amount: formatMoney(s.balance) })}</span>}
                                </span>
                            </Link>
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
        </div>
    );
}
