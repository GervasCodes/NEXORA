import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatShortDate, formatDate } from "../../utils/format";
import BarChart from "../../components/BarChart";

export default function DeliveryEarnings() {
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/earnings/me")
            .then(({ data }) => setDashboard(data.data))
            .catch(() => setError("Couldn't load your earnings."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading your earnings…</p>;
    if (error) return <p role="alert" className="text-coral text-sm">{error}</p>;
    if (!dashboard) return null;

    const { totalEarnings, totalDeliveries, todayEarnings, weekEarnings, monthEarnings, dailyBreakdown, recent } = dashboard;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Earnings</h1>
            <p className="text-ash text-sm mb-8">What you've earned delivering for NEXORA.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label="Total earned" value={formatMoney(totalEarnings)} mono />
                <Stat label="Today" value={formatMoney(todayEarnings)} mono />
                <Stat label="Last 7 days" value={formatMoney(weekEarnings)} mono />
                <Stat label="Last 30 days" value={formatMoney(monthEarnings)} mono />
            </div>

            <div className="border border-line rounded-lg p-4 mb-10">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium">Earnings - last 14 days</p>
                    <p className="text-xs text-ash">{totalDeliveries} deliveries total</p>
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
                <p className="text-sm font-medium mb-3">Recent deliveries</p>
                {recent.length === 0 ? (
                    <p className="text-ash text-sm">No completed deliveries yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {recent.map((r) => (
                            <li key={r.id} className="border border-line rounded-lg p-3 flex items-center justify-between text-sm">
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

function Stat({ label, value, mono }) {
    return (
        <div className="border border-line rounded-lg p-4">
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-xl font-medium ${mono ? "price" : "font-display"}`}>{value}</p>
        </div>
    );
}
