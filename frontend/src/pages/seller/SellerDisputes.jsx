import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useLanguage } from "../../context/LanguageContext";

const TYPE_KEYS = {
    damaged_item: "seller.disputes.type.damaged_item",
    delayed_delivery: "seller.disputes.type.delayed_delivery",
    defective_product: "seller.disputes.type.defective_product",
    wrong_item: "seller.disputes.type.wrong_item",
    missing_delivery: "seller.disputes.type.missing_delivery",
    other: "seller.disputes.type.other"
};

export default function SellerDisputes() {
    const { t } = useLanguage();
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/disputes/seller").then(({ data }) => setDisputes(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title={t("seller.disputes.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.disputes.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("seller.disputes.subtitle")}</p>

            {disputes.length === 0 ? (
                <EmptyState title={t("seller.disputes.empty")} />
            ) : (
                <ul className="space-y-3">
                    {disputes.map((d) => (
                        <li key={d.id}>
                            <Link
                                to={`/disputes/${d.id}`}
                                className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                    <div>
                                        <p className="price text-sm font-medium">{d.dispute_number}</p>
                                        <p className="text-xs text-ash">{t("seller.disputes.order", { number: d.order_number })}</p>
                                    </div>
                                    <StatusBadge domain="dispute" status={d.status} />
                                </div>
                                <p className="text-sm font-medium mb-1">{d.subject}</p>
                                <p className="text-xs text-ash mb-1">{TYPE_KEYS[d.type] ? t(TYPE_KEYS[d.type]) : d.type}</p>
                                {d.refund_amount && (
                                    <p className="text-xs text-coral">{t("seller.disputes.refund", { amount: formatMoney(d.refund_amount) })}</p>
                                )}
                                <p className="text-xs text-ash mt-1">{t("seller.disputes.filed", { date: formatDate(d.created_at) })}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
