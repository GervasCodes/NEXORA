import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import PageLoader from "../components/PageLoader";
import MaintenanceScreen from "../components/MaintenanceScreen";
import EmptyState from "../components/ui/EmptyState";

const STATUS_STYLES = {
    requested: "bg-mango/20 text-mango-dark",
    approved: "bg-azure/10 text-azure",
    shipped_back: "bg-azure/10 text-azure",
    received: "bg-azure/10 text-azure",
    refunded: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral",
    cancelled: "bg-line text-ash"
};

export default function Returns() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [maintenance, setMaintenance] = useState(null);

    const load = () => {
        setLoading(true);
        setMaintenance(null);
        api.get("/returns")
            .then(({ data }) => setReturns(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    if (loading) return <PageLoader />;
    if (maintenance) return <MaintenanceScreen title={t("returns.title")} message={maintenance} onRetry={load} />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={t("returns.title")} noIndex />
            <h1 className="font-display text-2xl mb-8">{t("returns.title")}</h1>

            {returns.length === 0 ? (
                <EmptyState
                    title={t("returns.empty")}
                    hint="Returns you request will show up here."
                    action={<Link to="/orders" className="text-teal hover:underline text-sm">{t("dispute.list.goToOrders")}</Link>}
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-ash">
                            <path d="M3 10h11a4 4 0 0 1 0 8h-3" />
                            <path d="m7 6-4 4 4 4" />
                        </svg>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {returns.map((r) => (
                        <li key={r.id}>
                            <Link
                                to={`/returns/${r.id}`}
                                className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                    <p className="text-xs text-ash">{t("dispute.list.orderPrefix")} {r.order_number}</p>
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[r.status] || "bg-line text-ash"}`}>
                                        {r.status.replace("_", " ")}
                                    </span>
                                </div>
                                <p className="text-sm font-medium mb-1">{t(`return.reason.${r.reason}`)}</p>
                                {r.refund_amount && (
                                    <p className="text-xs text-teal">{format(r.refund_amount)}</p>
                                )}
                                <p className="text-xs text-ash mt-1">{formatDate(r.created_at)}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
