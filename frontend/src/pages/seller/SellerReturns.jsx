import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useLanguage } from "../../context/LanguageContext";

const REASON_KEYS = {
    damaged_item: "seller.returns.reason.damaged_item",
    wrong_item: "seller.returns.reason.wrong_item",
    defective_product: "seller.returns.reason.defective_product",
    not_as_described: "seller.returns.reason.not_as_described",
    changed_mind: "seller.returns.reason.changed_mind",
    other: "seller.returns.reason.other"
};

export default function SellerReturns() {
    const { t } = useLanguage();
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/returns/seller").then(({ data }) => setReturns(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title={t("seller.returns.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.returns.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("seller.returns.subtitle")}</p>

            {returns.length === 0 ? (
                <EmptyState title={t("seller.returns.empty")} />
            ) : (
                <ul className="space-y-3">
                    {returns.map((r) => (
                        <li key={r.id}>
                            <Link
                                to={`/returns/${r.id}`}
                                className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                    <p className="text-xs text-ash">{t("seller.returns.order", { number: r.order_number })}</p>
                                    <StatusBadge domain="return" status={r.status} />
                                </div>
                                <p className="text-sm font-medium mb-1">{REASON_KEYS[r.reason] ? t(REASON_KEYS[r.reason]) : r.reason}</p>
                                {r.refund_amount && (
                                    <p className="text-xs text-coral">{t("seller.returns.refund", { amount: formatMoney(r.refund_amount) })}</p>
                                )}
                                <p className="text-xs text-ash mt-1">{t("seller.returns.filed", { date: formatDate(r.created_at) })}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
