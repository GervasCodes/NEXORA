import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatMoney } from "../../utils/format";
import { useSocket } from "../../context/SocketContext";
import BarChart from "../../components/BarChart";

export default function AdminDashboard() {
    const { socket } = useSocket();
    const [stats, setStats] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(false);

    const load = useCallback(() => {
        return Promise.all([
            api.get("/admin/dashboard"),
            api.get("/admin/analytics")
        ]).then(([dashboardRes, analyticsRes]) => {
            setStats(dashboardRes.data.data);
            setAnalytics(analyticsRes.data.data);
        });
    }, []);

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, [load]);

    
    useEffect(() => {
        if (!socket) return;

        const handleStatsChanged = () => {
            setLive(true);
            load().finally(() => setTimeout(() => setLive(false), 600));
        };

        socket.on("admin:stats_changed", handleStatsChanged);
        return () => socket.off("admin:stats_changed", handleStatsChanged);
    }, [socket, load]);

    if (loading) return <p className="text-ash">Loading dashboard…</p>;
    if (!stats) return <p className="text-coral">Couldn't load dashboard stats.</p>;

    const chartData = analytics
        ? [
            ...analytics.dailySales,
            ...analytics.forecast.map((d) => ({ ...d, projected: true }))
        ]
        : [];

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <h1 className="font-display text-2xl">Platform overview</h1>
                {live && <span className="text-xs text-teal flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" /> Updating…
                </span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label="Buyers" value={stats.users.buyers} />
                <Stat label="Sellers" value={stats.users.sellers} />
                <Stat label="Delivery agents" value={stats.users.delivery_agents} />
                <Stat label="Revenue (paid)" value={formatMoney(stats.revenue)} mono />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label="Total orders" value={stats.orders.total} />
                <Stat label="Pending" value={stats.orders.pending} />
                <Stat label="Delivered" value={stats.orders.delivered} />
                <Stat label="Cancelled" value={stats.orders.cancelled} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label="Total products" value={stats.products.total} />
                <Stat label="Active products" value={stats.products.active} />
            </div>

            {analytics && (
                <>
                    <div className="border border-line rounded-lg p-5 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs uppercase tracking-widest text-ash">
                                Daily sales · last 14 days + 7-day forecast
                            </p>
                            <span className="text-[10px] text-ash flex items-center gap-1">
                                <span className="w-2 h-2 bg-mango/40 border border-dashed border-mango-dark rounded-sm" /> Projected
                            </span>
                        </div>
                        <BarChart
                            data={chartData}
                            labelKey="label"
                            valueKey="revenue"
                            formatValue={(v) => formatMoney(v)}
                            highlightKey="projected"
                        />
                        <p className="text-[11px] text-ash mt-3">
                            Forecast is a straight trend line fit to the last 30 days of revenue - a rough
                            directional estimate, not a guarantee.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-4">Top products</p>
                            {analytics.topProducts.length === 0 ? (
                                <p className="text-ash text-sm">No paid orders yet.</p>
                            ) : (
                                <ul className="divide-y divide-line">
                                    {analytics.topProducts.map((p, i) => (
                                        <li key={p.id} className="py-2.5 flex items-center gap-3 text-sm">
                                            <span className="text-ash text-xs w-4 shrink-0">{i + 1}</span>
                                            <Link to={`/products/${p.slug}`} className="flex-1 min-w-0 truncate hover:text-teal transition-colors">
                                                {p.name}
                                            </Link>
                                            <span className="price text-xs text-ash shrink-0">{p.units_sold} sold</span>
                                            <span className="price text-xs font-medium shrink-0">{formatMoney(p.revenue)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-4">Top sellers</p>
                            {analytics.topSellers.length === 0 ? (
                                <p className="text-ash text-sm">No paid orders yet.</p>
                            ) : (
                                <ul className="divide-y divide-line">
                                    {analytics.topSellers.map((s, i) => (
                                        <li key={s.user_id} className="py-2.5 flex items-center gap-2 text-sm">
                                            <span className="text-ash text-xs w-4 shrink-0">{i + 1}</span>
                                            <span className="flex-1 min-w-0 truncate">
                                                {s.store_name}
                                                {(s.is_verified === 1 || s.is_verified === true) && (
                                                    <span className="ml-1.5 text-[10px] text-teal font-semibold uppercase align-middle">Verified</span>
                                                )}
                                            </span>
                                            <span className="price text-xs text-ash shrink-0">{s.order_count} orders</span>
                                            <span className="price text-xs font-medium shrink-0">{formatMoney(s.revenue)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <Link to="/admin/fraud" className="text-sm text-teal hover:underline">
                        Review flagged orders & sellers →
                    </Link>
                </>
            )}
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
