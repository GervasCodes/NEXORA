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
    const [servicesAnalytics, setServicesAnalytics] = useState(null);
    // Phase 4 (Analytics & Business Metrics) - GMV / take rate / repeat
    // buyers / provider retention, blended across products + services.
    const [businessMetrics, setBusinessMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(false);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(() => {
        return Promise.all([
            api.get("/admin/dashboard"),
            api.get("/admin/analytics"),
            api.get("/admin/analytics/services"),
            api.get("/admin/analytics/business")
        ]).then(([dashboardRes, analyticsRes, servicesAnalyticsRes, businessMetricsRes]) => {
            setStats(dashboardRes.data.data);
            setAnalytics(analyticsRes.data.data);
            setServicesAnalytics(servicesAnalyticsRes.data.data);
            setBusinessMetrics(businessMetricsRes.data.data);
        });
    }, []);

    // Auth is a Bearer token (see api/client.js), so a plain <a href> to
    // the export endpoint wouldn't carry it - fetch as a blob instead and
    // trigger the download client-side.
    const handleExportCsv = useCallback(() => {
        setExporting(true);
        api.get("/admin/analytics/business/export?days=90", { responseType: "blob" })
            .then((response) => {
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement("a");
                link.href = url;
                link.download = "nexora-gmv-90d.csv";
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            })
            .finally(() => setExporting(false));
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

    // Phase 5 (Growth) - services counterpart of chartData above.
    const bookingChartData = servicesAnalytics
        ? [
            ...servicesAnalytics.dailyBookingSales,
            ...servicesAnalytics.forecast.map((d) => ({ ...d, projected: true }))
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label="Total bookings" value={stats.bookings.total} />
                <Stat label="Completed bookings" value={stats.bookings.completed} />
                <Stat label="Booking revenue (paid)" value={formatMoney(stats.bookingRevenue)} mono />
                <Stat label="Active services" value={stats.services.active} />
            </div>

            {businessMetrics && (
                <div className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl">Business metrics</h2>
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={exporting}
                            className="text-xs text-teal hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting ? "Preparing CSV…" : "Export GMV CSV (90d) ↓"}
                        </button>
                    </div>

                    <p className="text-xs uppercase tracking-widest text-ash mb-3">
                        GMV (Gross Merchandise Value) · products + services
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        <Stat label="GMV today" value={formatMoney(businessMetrics.gmv.today)} mono />
                        <Stat label="GMV (7d)" value={formatMoney(businessMetrics.gmv.last7Days)} mono />
                        <Stat label="GMV (30d)" value={formatMoney(businessMetrics.gmv.last30Days)} mono />
                        <Stat label="GMV (all-time)" value={formatMoney(businessMetrics.gmv.allTime)} mono />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-3">Take rate</p>
                            <p className="text-2xl font-medium price mb-1">{businessMetrics.takeRate.blendedRatePercent}%</p>
                            <p className="text-xs text-ash mb-3">
                                {formatMoney(businessMetrics.takeRate.commissionRevenue)} commission earned on{" "}
                                {formatMoney(businessMetrics.takeRate.gmv)} GMV credited so far
                            </p>
                            <div className="flex justify-between text-xs text-ash">
                                <span>Products: {businessMetrics.takeRate.products.ratePercent}%</span>
                                <span>Services: {businessMetrics.takeRate.services.ratePercent}%</span>
                            </div>
                        </div>

                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-3">Repeat buyers</p>
                            <p className="text-2xl font-medium price mb-1">{businessMetrics.repeatBuyers.repeatRatePercent}%</p>
                            <p className="text-xs text-ash mb-3">
                                {businessMetrics.repeatBuyers.repeatBuyers} of {businessMetrics.repeatBuyers.totalBuyers} buyers
                                have more than one paid order or booking
                            </p>
                            <div className="flex justify-between text-xs text-ash">
                                <span>Active (30d): {businessMetrics.repeatBuyers.last30Days.activeBuyers}</span>
                                <span>Returning: {businessMetrics.repeatBuyers.last30Days.returningBuyers}</span>
                                <span>New: {businessMetrics.repeatBuyers.last30Days.newBuyers}</span>
                            </div>
                        </div>

                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-3">Provider retention</p>
                            <p className="text-2xl font-medium price mb-1">{businessMetrics.providerRetention.retentionRatePercent}%</p>
                            <p className="text-xs text-ash mb-3">
                                {businessMetrics.providerRetention.retained} of {businessMetrics.providerRetention.activePrior} providers
                                active in the prior 30 days are still active now
                            </p>
                            <div className="flex justify-between text-xs text-ash">
                                <span>Active now: {businessMetrics.providerRetention.activeCurrent}</span>
                                <span>Churned: {businessMetrics.providerRetention.churned}</span>
                                <span>New: {businessMetrics.providerRetention.newProviders}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

                    <Link to="/admin/fraud" className="text-sm text-teal hover:underline block mb-10">
                        Review flagged orders & sellers →
                    </Link>
                </>
            )}

            {servicesAnalytics && (
                <>
                    <h2 className="font-display text-xl mb-4">Services marketplace</h2>

                    <div className="border border-line rounded-lg p-5 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs uppercase tracking-widest text-ash">
                                Daily booking revenue · last 14 days + 7-day forecast
                            </p>
                            <span className="text-[10px] text-ash flex items-center gap-1">
                                <span className="w-2 h-2 bg-mango/40 border border-dashed border-mango-dark rounded-sm" /> Projected
                            </span>
                        </div>
                        <BarChart
                            data={bookingChartData}
                            labelKey="label"
                            valueKey="revenue"
                            formatValue={(v) => formatMoney(v)}
                            highlightKey="projected"
                        />
                        <p className="text-[11px] text-ash mt-3">
                            Forecast is a straight trend line fit to the last 30 days of booking revenue - a
                            rough directional estimate, not a guarantee.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-4">Top services</p>
                            {servicesAnalytics.topServices.length === 0 ? (
                                <p className="text-ash text-sm">No paid bookings yet.</p>
                            ) : (
                                <ul className="divide-y divide-line">
                                    {servicesAnalytics.topServices.map((s, i) => (
                                        <li key={s.id} className="py-2.5 flex items-center gap-3 text-sm">
                                            <span className="text-ash text-xs w-4 shrink-0">{i + 1}</span>
                                            <Link to={`/services/${s.slug}`} className="flex-1 min-w-0 truncate hover:text-teal transition-colors">
                                                {s.title}
                                            </Link>
                                            <span className="price text-xs text-ash shrink-0">{s.booking_count} bookings</span>
                                            <span className="price text-xs font-medium shrink-0">{formatMoney(s.revenue)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="border border-line rounded-lg p-5">
                            <p className="text-xs uppercase tracking-widest text-ash mb-4">Top providers</p>
                            {servicesAnalytics.topProviders.length === 0 ? (
                                <p className="text-ash text-sm">No paid bookings yet.</p>
                            ) : (
                                <ul className="divide-y divide-line">
                                    {servicesAnalytics.topProviders.map((p, i) => (
                                        <li key={p.user_id} className="py-2.5 flex items-center gap-2 text-sm">
                                            <span className="text-ash text-xs w-4 shrink-0">{i + 1}</span>
                                            <span className="flex-1 min-w-0 truncate">
                                                {p.store_name}
                                                {(p.is_verified === 1 || p.is_verified === true) && (
                                                    <span className="ml-1.5 text-[10px] text-teal font-semibold uppercase align-middle">Verified</span>
                                                )}
                                            </span>
                                            <span className="price text-xs text-ash shrink-0">{p.booking_count} bookings</span>
                                            <span className="price text-xs font-medium shrink-0">{formatMoney(p.revenue)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="border border-line rounded-lg p-5">
                        <p className="text-xs uppercase tracking-widest text-ash mb-4">Revenue by category</p>
                        {servicesAnalytics.categoryPerformance.every((c) => c.booking_count === 0) ? (
                            <p className="text-ash text-sm">No paid bookings yet.</p>
                        ) : (
                            <ul className="divide-y divide-line">
                                {servicesAnalytics.categoryPerformance.map((c) => (
                                    <li key={c.id} className="py-2.5 flex items-center gap-3 text-sm">
                                        <span className="flex-1 min-w-0 truncate">{c.name}</span>
                                        <span className="price text-xs text-ash shrink-0">{c.booking_count} bookings</span>
                                        <span className="price text-xs font-medium shrink-0">{formatMoney(c.revenue)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
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
