import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import PageLoader from "../components/PageLoader";
import MaintenanceScreen from "../components/MaintenanceScreen";

const STATUS_STYLES = {
    open: "bg-mango/20 text-mango-dark",
    under_review: "bg-azure/10 text-azure",
    resolved: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral",
    withdrawn: "bg-line text-ash"
};

export default function Disputes() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [maintenance, setMaintenance] = useState(null);

    const load = () => {
        setLoading(true);
        setMaintenance(null);
        api.get("/disputes")
            .then(({ data }) => setDisputes(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    if (loading) return <PageLoader />;
    if (maintenance) return <MaintenanceScreen title={t("dispute.list.maintenanceTitle")} message={maintenance} onRetry={load} />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex items-baseline justify-between mb-1">
                <PageMeta title="My Disputes" noIndex />
                <h1 className="font-display text-2xl">{t("dispute.list.title")}</h1>
            </div>
            <p className="text-ash text-sm mb-8">
                {t("dispute.list.intro")}
            </p>

            {disputes.length === 0 ? (
                <div className="border border-line rounded-lg p-8 text-center">
                    <p className="text-ash text-sm mb-3">{t("dispute.list.empty")}</p>
                    <Link to="/orders" className="text-teal hover:underline text-sm">{t("dispute.list.goToOrders")}</Link>
                </div>
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
                                        <p className="text-xs text-ash">{t("dispute.list.orderPrefix")} {d.order_number}</p>
                                    </div>
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[d.status] || "bg-line text-ash"}`}>
                                        {t(`dispute.status.${d.status}`)}
                                    </span>
                                </div>
                                <p className="text-sm font-medium mb-1">{d.subject}</p>
                                <p className="text-xs text-ash mb-1">{t(`dispute.type.${d.type}`)}</p>
                                {d.refund_amount && (
                                    <p className="text-xs text-teal">{t("dispute.list.refundApproved")}: {format(d.refund_amount)}</p>
                                )}
                                <p className="text-xs text-ash mt-1">{t("dispute.list.filed")} {formatDate(d.created_at)}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
