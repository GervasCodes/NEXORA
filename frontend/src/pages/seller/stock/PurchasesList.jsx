import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { listPurchases } from "../../../api/stock";
import Skeleton from "../../../components/Skeleton";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import { useLanguage } from "../../../context/LanguageContext";
import { formatDateTime, formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

const PAGE_SIZE = 20;

export default function PurchasesList() {
    const { t } = useLanguage();
    const base = useStockBase();
    const [unpaid, setUnpaid] = useState(false);
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setError("");
        listPurchases({ page, limit: PAGE_SIZE, unpaid: unpaid ? 1 : undefined }).then(setData).catch((err) => setError(extractErrorMessage(err)));
    }, [page, unpaid]);
    useEffect(load, [load]);

    if (error) return <ErrorState title={t("stock.loadError")} hint={error} onRetry={load} />;
    const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-ash">
                    <input type="checkbox" checked={unpaid} onChange={(e) => { setUnpaid(e.target.checked); setPage(1); }} />
                    {t("stock.trade.onlyUnpaid")}
                </label>
                <Button as={Link} to={`${base}/stock/purchases/new`} className="min-h-[44px]">{t("stock.trade.newPurchase")}</Button>
            </div>
            {data && (
                <dl className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.trade.totalBought")}</dt><dd className="text-lg font-medium price">{formatMoney(data.summary.total)}</dd></div>
                    <div className="border border-line rounded-lg p-3"><dt className="text-xs text-ash">{t("stock.trade.youOwe")}</dt><dd className="text-lg font-medium price">{formatMoney(data.summary.owed)}</dd></div>
                </dl>
            )}
            {!data ? (
                <div aria-busy="true"><Skeleton className="h-16 w-full mb-2" /><Skeleton className="h-16 w-full" /></div>
            ) : data.items.length === 0 ? (
                <EmptyState title={t("stock.trade.noPurchases")} hint={t("stock.trade.noPurchasesHint")} />
            ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {data.items.map((p) => (
                        <li key={p.id}>
                            <Link to={`${base}/stock/purchases/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 min-h-[56px] hover:bg-line/20 focus-ring">
                                <span className="min-w-0">
                                    <span className="block font-medium">{p.purchase_no}{p.invoice_no ? <span className="text-ash font-normal"> · {p.invoice_no}</span> : null}</span>
                                    <span className="block text-xs text-ash">{formatDateTime(p.purchased_at)}{p.supplier_name ? ` · ${p.supplier_name}` : ""}</span>
                                </span>
                                <span className="text-right">
                                    <span className="block price font-medium">{formatMoney(p.total_amount)}</span>
                                    {p.balance > 0 && <span className="text-xs text-mango-dark">{t("stock.trade.youOweAmount", { amount: formatMoney(p.balance) })}</span>}
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
