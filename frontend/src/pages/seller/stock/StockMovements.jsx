import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../../api/client";
import { listStockMovements } from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import { useLanguage } from "../../../context/LanguageContext";
import { formatDateTime } from "../../../utils/format";

const PAGE_SIZE = 20;
const TYPES = ["purchase", "sale", "order_deduct", "order_restore", "return", "void", "correction", "opening"];

export default function StockMovements() {
    const { t } = useLanguage();
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setError("");
        listStockMovements({ page, limit: PAGE_SIZE, type: type || undefined })
            .then(setData)
            .catch((err) => setError(extractErrorMessage(err)));
    }, [page, type]);
    useEffect(load, [load]);

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;
    const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <div>
            <label className="text-xs text-ash flex flex-col gap-1 max-w-xs mb-4">
                {t("stock.movements.filterType")}
                <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
                    className="border border-line rounded-md px-3 py-2 min-h-[44px] text-sm bg-paper text-ink focus-ring">
                    <option value="">{t("stock.movements.all")}</option>
                    {TYPES.map((k) => <option key={k} value={k}>{t(`stock.movements.type.${k}`)}</option>)}
                </select>
            </label>

            {!data ? (
                <div aria-busy="true"><Skeleton className="h-12 w-full mb-2" /><Skeleton className="h-12 w-full" /></div>
            ) : data.items.length === 0 ? (
                <EmptyState title={t("stock.movements.empty")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((m) => (
                        <li key={m.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium truncate">{m.item_name}</p>
                                <p className="text-xs text-ash">
                                    {t(`stock.movements.type.${m.type}`)} · {formatDateTime(m.created_at)}
                                    {m.reason ? ` · ${m.reason}` : ""}
                                </p>
                            </div>
                            <p className="text-right">
                                <span className={`font-medium ${m.quantity_change < 0 ? "text-coral" : "text-ink"}`}>
                                    {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                                </span>
                                <span className="block text-xs text-ash">{t("stock.movements.balance", { before: m.stock_before, after: m.stock_after })}</span>
                            </p>
                        </li>
                    ))}
                </ul>
            )}

            <p className="text-xs text-ash mt-3">{t("stock.movements.note")}</p>

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
