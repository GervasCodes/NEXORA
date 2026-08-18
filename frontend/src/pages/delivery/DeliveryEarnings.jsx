import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatShortDate, formatDate } from "../../utils/format";
import BarChart from "../../components/BarChart";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import { useLanguage } from "../../context/LanguageContext";

export default function DeliveryEarnings() {
    const { t } = useLanguage();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/earnings/me")
            .then(({ data }) => setDashboard(data.data))
            .catch(() => setError(t("delivery.agent.earnings.loadError")))
            .finally(() => setLoading(false));
    }, [t]);

    if (loading) return <PageLoader />;
    if (error) return <p role="alert" className="text-coral text-sm">{error}</p>;
    if (!dashboard) return null;

    const { totalEarnings, totalDeliveries, todayEarnings, weekEarnings, monthEarnings, dailyBreakdown, recent } = dashboard;

    return (
        <div className="animate-fade-in">
            <PageMeta title="Earnings" noIndex />
            <h1 className="font-display text-2xl mb-1">{t("delivery.agent.earnings.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("delivery.agent.earnings.subtitle")}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label={t("delivery.agent.earnings.totalEarned")} value={formatMoney(totalEarnings)} mono delay={0} highlight />
                <Stat label={t("delivery.agent.earnings.today")} value={formatMoney(todayEarnings)} mono delay={40} />
                <Stat label={t("delivery.agent.earnings.last7Days")} value={formatMoney(weekEarnings)} mono delay={80} />
                <Stat label={t("delivery.agent.earnings.last30Days")} value={formatMoney(monthEarnings)} mono delay={120} />
            </div>

            <div className="border border-line rounded-lg p-4 mb-10 animate-slide-up hover:shadow-md transition-shadow" style={{ animationDelay: "160ms" }}>
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium">{t("delivery.agent.earnings.chartTitle")}</p>
                    <p className="text-xs text-ash">{totalDeliveries} {t("delivery.agent.earnings.deliveriesTotal")}</p>
                </div>
                <BarChart data={dailyBreakdown} labelKey="day" valueKey="amount" formatValue={formatMoney} />
                {dailyBreakdown.length > 0 && (
                    <div className="flex justify-between text-xs text-ash mt-2">
                        <span>{formatShortDate(dailyBreakdown[0].day)}</span>
                        <span>{formatShortDate(dailyBreakdown[dailyBreakdown.length - 1].day)}</span>
                    </div>
                )}
            </div>

            <div>
                <p className="text-sm font-medium mb-3">{t("delivery.agent.earnings.recent")}</p>
                {recent.length === 0 ? (
                    <p className="text-ash text-sm">{t("delivery.agent.earnings.noRecent")}</p>
                ) : (
                    <ul className="space-y-2">
                        {recent.map((r, i) => (
                            <li
                                key={r.id}
                                className="border border-line rounded-lg p-3 flex items-center justify-between text-sm animate-slide-up hover:shadow-md hover:-translate-y-0.5 hover:border-teal/30 transition-all"
                                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                            >
                                <div>
                                    <p className="font-medium">{r.order_number}</p>
                                    <p className="text-xs text-ash">{r.shipping_city} · {formatDate(r.created_at)}</p>
                                </div>
                                <span className="price text-teal">+{formatMoney(r.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value, mono, delay = 0, highlight }) {
    return (
        <div
            className={`border rounded-lg p-4 animate-slide-up hover:-translate-y-0.5 hover:shadow-md transition-all ${highlight ? "border-teal/30 bg-teal/5" : "border-line"}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-xl font-medium ${mono ? "price" : "font-display"} ${highlight ? "text-teal" : ""}`}>{value}</p>
        </div>
    );
}
