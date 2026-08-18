import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatShortDate } from "../../utils/format";
import BarChart from "../../components/BarChart";
import LineChart from "../../components/LineChart";
import PeriodComparisonCard from "../../components/PeriodComparisonCard";
import VerificationFeeGate from "../../components/VerificationFeeGate";
import NexoraAnalyticsSummary from "../../components/ai/NexoraAnalyticsSummary";
import Skeleton from "../../components/Skeleton";
import PageMeta from "../../components/PageMeta";

const STATUS_LABELS = {
    pending: "Pending",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
};

// Merchant-Type-Aware Dashboard (Phase 4) - GET /seller/analytics stays
// the single source of truth for the paid Verified Seller fee gate
// (requireVerificationFeePaid isn't merchant-type-specific, so every
// merchant type still needs it called once to know whether analytics is
// unlocked at all). What changes is what's rendered/fetched once it is
// unlocked: the existing order/product breakdown only for
// product/hybrid sellers, and a bookings breakdown - computed client-
// side from GET /bookings/provider/mine, the same endpoint
// SellerBookings.jsx already calls - for service/hybrid sellers. No new
// backend endpoints or queries.
function summarizeBookings(bookings) {
    const paid = bookings.filter((b) => b.payment_status === "paid");
    const grossBookingRevenue = paid.reduce((sum, b) => sum + Number(b.amount), 0);

    const dailyMap = new Map();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    paid.forEach((b) => {
        const day = String(b.created_at).slice(0, 10);
        if (new Date(day) < cutoff) return;
        dailyMap.set(day, (dailyMap.get(day) || 0) + Number(b.amount));
    });
    const dailyBookings = Array.from(dailyMap.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, amount]) => ({ day, amount }));

    const serviceMap = new Map();
    paid.forEach((b) => {
        const entry = serviceMap.get(b.service_id) || { id: b.service_id, name: b.service_title, bookings: 0, revenue: 0 };
        entry.bookings += 1;
        entry.revenue += Number(b.amount);
        serviceMap.set(b.service_id, entry);
    });
    const topServices = Array.from(serviceMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    return {
        totalBookings: bookings.length,
        pendingBookings: bookings.filter((b) => b.status === "pending").length,
        grossBookingRevenue,
        dailyBookings,
        topServices
    };
}

export default function SellerAnalytics() {
    const { profile, refreshProfile } = useOutletContext();
    const merchantType = profile?.merchant_type || "product";
    const showProducts = merchantType === "product" || merchantType === "hybrid";
    const showServices = merchantType === "service" || merchantType === "hybrid";

    const [analytics, setAnalytics] = useState(null);
    const [bookingStats, setBookingStats] = useState(null);
    // Phase A5 (Advanced Analytics) - period comparison + top customers
    // for this seller's product sales.
    const [advancedAnalytics, setAdvancedAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [feeRequired, setFeeRequired] = useState(null); // required_fee amount, or null if not locked
    const [exportingType, setExportingType] = useState(null);
    // Trend view toggle - Bar/Line render the exact same dailySales data,
    // this just swaps which of the two chart components draws it.
    const [chartView, setChartView] = useState("bar");
    // Phase P8 (Analytics Visualization) - custom date-range selection,
    // same shape as AdminDashboard.jsx's equivalent state.
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [customRangeError, setCustomRangeError] = useState("");
    const [loadingCustomRange, setLoadingCustomRange] = useState(false);

    const load = () => {
        setLoading(true);
        setError("");
        setFeeRequired(null);
        api.get("/seller/analytics")
            .then(({ data }) => {
                setAnalytics(data.data);
                return Promise.all([
                    showServices ? api.get("/bookings/provider/mine") : null,
                    showProducts ? api.get("/seller/analytics/advanced") : null
                ]);
            })
            .then(([bookingsRes, advancedRes]) => {
                if (bookingsRes) setBookingStats(summarizeBookings(bookingsRes.data.data));
                if (advancedRes) setAdvancedAnalytics(advancedRes.data.data);
            })
            .catch((err) => {
                if (err.response?.data?.code === "VERIFICATION_FEE_REQUIRED") {
                    setFeeRequired(err.response.data.required_fee);
                } else {
                    setError(extractErrorMessage(err));
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(load, [showServices, showProducts]);

    // Re-fetches just the advanced-analytics section with the chosen
    // custom range, same pattern as AdminDashboard.jsx's applyCustomRange.
    const applyCustomRange = () => {
        setCustomRangeError("");
        if (!customStart || !customEnd) {
            setCustomRangeError("Pick both a start and end date.");
            return;
        }
        if (new Date(customEnd) <= new Date(customStart)) {
            setCustomRangeError("End date must be after start date.");
            return;
        }
        setLoadingCustomRange(true);
        api.get("/seller/analytics/advanced", { params: { start: customStart, end: customEnd } })
            .then(({ data }) => setAdvancedAnalytics(data.data))
            .catch((err) => setCustomRangeError(err.response?.data?.message || "Couldn't load that range."))
            .finally(() => setLoadingCustomRange(false));
    };

    // Same blob-download pattern the admin dashboard uses for its CSV
    // exports - Bearer auth means a plain <a href> can't be used.
    const handleExportCsv = useCallback((type) => {
        setExportingType(type);
        api.get(`/seller/analytics/export?type=${type}`, { responseType: "blob" })
            .then((response) => {
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement("a");
                link.href = url;
                link.download = `nexora-seller-${type}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            })
            .finally(() => setExportingType(null));
    }, []);

    // Skeleton mirrors the real dashboard's shape (stat cards, chart,
    // two product/service lists) rather than a full-page blocking
    // spinner - Phase 8 UX Polish ("heavy dashboards" call-out).
    if (loading) {
        return (
            <div className="animate-fade-in">
                <Skeleton className="h-7 w-40 mb-2" />
                <Skeleton className="h-4 w-56 mb-8" />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="border border-line rounded-lg p-4">
                            <Skeleton className="h-3 w-16 mb-2" />
                            <Skeleton className="h-6 w-20" />
                        </div>
                    ))}
                </div>

                <div className="border border-line rounded-lg p-4 mb-10">
                    <Skeleton className="h-4 w-40 mb-4" />
                    <Skeleton className="w-full h-40" />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="border border-line rounded-lg p-4">
                            <Skeleton className="h-4 w-32 mb-4" />
                            <Skeleton className="h-3 w-full mb-2" />
                            <Skeleton className="h-3 w-5/6 mb-2" />
                            <Skeleton className="h-3 w-2/3" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (feeRequired !== null) {
        return (
            <div>
                <h1 className="font-display text-2xl mb-1">Analytics</h1>
                <p className="text-ash text-sm mb-8">
                    Analytics is part of the paid Verified Seller features - pay the one-time fee below to unlock it.
                </p>
                <VerificationFeeGate
                    requiredFee={feeRequired}
                    returnPath="/seller/analytics"
                    onPaid={() => {
                        refreshProfile?.();
                        load();
                    }}
                />
            </div>
        );
    }

    if (error) return <p role="alert" className="text-coral text-sm">{error}</p>;
    if (!analytics) return null;

    const { totals, commissionRate, statusBreakdown, dailySales, topProducts, repeatCustomers } = analytics;

    return (
        <div className="animate-fade-in">
            <PageMeta title="Analytics" noIndex />
            <h1 className="font-display text-2xl mb-1">Analytics</h1>
            <p className="text-ash text-sm mb-8">How {profile.store_name} is performing.</p>

            <NexoraAnalyticsSummary />

            {showProducts && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <Stat label="Gross sales" value={formatMoney(totals.grossSales)} mono delay={0} />
                        <Stat label={`Commission paid (${commissionRate}%)`} value={formatMoney(totals.commissionPaid)} mono delay={40} />
                        <Stat label="Net earnings" value={formatMoney(totals.netEarnings)} mono delay={80} highlight />
                        <Stat label="Total orders" value={totals.totalOrders} delay={120} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                        {Object.entries(STATUS_LABELS).map(([key, label], i) => (
                            <Stat key={key} label={label} value={statusBreakdown[key] || 0} delay={160 + i * 30} />
                        ))}
                    </div>

                    <div className="border border-line rounded-lg p-4 mb-10 animate-slide-up hover:shadow-md transition-shadow" style={{ animationDelay: "320ms" }}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-medium">Sales - last 30 days</p>
                            <div className="flex items-center border border-line rounded-md overflow-hidden text-[11px]">
                                <button
                                    type="button"
                                    onClick={() => setChartView("bar")}
                                    className={`px-2 py-1 transition-colors ${chartView === "bar" ? "bg-azure text-paper" : "text-ash hover:bg-line/30"}`}
                                >
                                    Bar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChartView("line")}
                                    className={`px-2 py-1 transition-colors ${chartView === "line" ? "bg-azure text-paper" : "text-ash hover:bg-line/30"}`}
                                >
                                    Line
                                </button>
                            </div>
                        </div>
                        {chartView === "bar" ? (
                            <BarChart data={dailySales} labelKey="day" valueKey="amount" formatValue={formatMoney} />
                        ) : (
                            <LineChart data={dailySales} labelKey="day" valueKey="amount" formatValue={formatMoney} />
                        )}
                        {dailySales.length > 0 && (
                            <div className="flex justify-between text-xs text-ash mt-2">
                                <span>{formatShortDate(dailySales[0].day)}</span>
                                <span>{formatShortDate(dailySales[dailySales.length - 1].day)}</span>
                            </div>
                        )}
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-10">
                        <div className="border border-line rounded-lg p-4 animate-slide-up hover:shadow-md transition-shadow" style={{ animationDelay: "360ms" }}>
                            <p className="text-sm font-medium mb-4">Best-selling products</p>
                            {topProducts.length === 0 ? (
                                <p className="text-ash text-sm">No sales yet.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {topProducts.map((p) => (
                                        <li key={p.id} className="flex items-center justify-between text-sm px-2 -mx-2 py-1 rounded-md transition-colors hover:bg-line/30">
                                            <span className="truncate pr-3">{p.name}</span>
                                            <span className="text-ash whitespace-nowrap">
                                                {p.units_sold} sold · <span className="price">{formatMoney(p.revenue)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="border border-line rounded-lg p-4 animate-slide-up hover:shadow-md transition-shadow" style={{ animationDelay: "400ms" }}>
                            <p className="text-sm font-medium mb-4">Customers</p>
                            <Stat label="Repeat customers" value={repeatCustomers} />
                        </div>
                    </div>

                    {advancedAnalytics && (
                        <div className="mb-10">
                            <p className="text-sm font-medium mb-4">Advanced analytics</p>

                            {/* Phase P8 (Analytics Visualization) - custom date-range
                                selection, same shape/behavior as AdminDashboard.jsx's
                                equivalent section. */}
                            <div className="border border-line rounded-lg p-4 mb-6">
                                <p className="text-xs uppercase tracking-widest text-ash mb-3">Custom date range</p>
                                <div className="flex flex-wrap items-end gap-3">
                                    <label className="text-xs text-ash flex flex-col gap-1">
                                        Start
                                        <input
                                            type="date"
                                            value={customStart}
                                            onChange={(e) => setCustomStart(e.target.value)}
                                            className="border border-line rounded-md px-2 py-1.5 text-sm"
                                        />
                                    </label>
                                    <label className="text-xs text-ash flex flex-col gap-1">
                                        End
                                        <input
                                            type="date"
                                            value={customEnd}
                                            onChange={(e) => setCustomEnd(e.target.value)}
                                            className="border border-line rounded-md px-2 py-1.5 text-sm"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={applyCustomRange}
                                        disabled={loadingCustomRange}
                                        className="text-sm bg-azure text-paper px-3 py-1.5 rounded-md hover:bg-azure-deep transition-colors disabled:opacity-50"
                                    >
                                        {loadingCustomRange ? "Loading…" : "Apply"}
                                    </button>
                                    {advancedAnalytics.periodComparison.custom && !loadingCustomRange && (
                                        <button
                                            type="button"
                                            onClick={() => { setCustomStart(""); setCustomEnd(""); setCustomRangeError(""); load(); }}
                                            className="text-xs text-ash hover:underline"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                {customRangeError && <p className="text-coral text-xs mt-2">{customRangeError}</p>}
                            </div>

                            <div className={`grid grid-cols-1 gap-4 mb-6 ${advancedAnalytics.periodComparison.custom ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                                <PeriodComparisonCard
                                    label="This week vs last week"
                                    current={advancedAnalytics.periodComparison.week.current}
                                    previous={advancedAnalytics.periodComparison.week.previous}
                                    growthPercent={advancedAnalytics.periodComparison.week.growthPercent}
                                    formatValue={formatMoney}
                                    transactionLabel="orders"
                                />
                                <PeriodComparisonCard
                                    label="Last 30 days vs prior 30 days"
                                    current={advancedAnalytics.periodComparison.month.current}
                                    previous={advancedAnalytics.periodComparison.month.previous}
                                    growthPercent={advancedAnalytics.periodComparison.month.growthPercent}
                                    formatValue={formatMoney}
                                    transactionLabel="orders"
                                />
                                {advancedAnalytics.periodComparison.custom && (
                                    <PeriodComparisonCard
                                        label={`${customStart} → ${customEnd}`}
                                        current={advancedAnalytics.periodComparison.custom.current}
                                        previous={advancedAnalytics.periodComparison.custom.previous}
                                        growthPercent={advancedAnalytics.periodComparison.custom.growthPercent}
                                        formatValue={formatMoney}
                                        transactionLabel="orders"
                                    />
                                )}
                            </div>

                            {/* Phase P8 (Analytics Visualization) - GMV bar chart alongside
                                the text cards, same pairing AdminDashboard.jsx uses. */}
                            <div className="border border-line rounded-lg p-4 mb-6">
                                <p className="text-sm font-medium mb-4">Period comparison, visualized</p>
                                <BarChart
                                    data={[
                                        { label: "Last week", revenue: advancedAnalytics.periodComparison.week.previous.gmv },
                                        { label: "This week", revenue: advancedAnalytics.periodComparison.week.current.gmv },
                                        { label: "Prior 30d", revenue: advancedAnalytics.periodComparison.month.previous.gmv },
                                        { label: "Last 30d", revenue: advancedAnalytics.periodComparison.month.current.gmv },
                                        ...(advancedAnalytics.periodComparison.custom
                                            ? [
                                                { label: "Custom (prior)", revenue: advancedAnalytics.periodComparison.custom.previous.gmv },
                                                { label: "Custom (selected)", revenue: advancedAnalytics.periodComparison.custom.current.gmv }
                                            ]
                                            : [])
                                    ]}
                                    labelKey="label"
                                    valueKey="revenue"
                                    formatValue={formatMoney}
                                />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="border border-line rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-sm font-medium">Top customers</p>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleExportCsv("customers")}
                                                disabled={exportingType === "customers"}
                                                className="text-xs text-teal hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {exportingType === "customers" ? "Preparing…" : "Export customers ↓"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleExportCsv("products")}
                                                disabled={exportingType === "products"}
                                                className="text-xs text-teal hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {exportingType === "products" ? "Preparing…" : "Export products ↓"}
                                            </button>
                                        </div>
                                    </div>
                                    {advancedAnalytics.topCustomers.length === 0 ? (
                                        <p className="text-ash text-sm">No sales yet.</p>
                                    ) : (
                                        <ul className="space-y-3">
                                            {advancedAnalytics.topCustomers.map((c) => (
                                                <li key={c.id} className="flex items-center justify-between text-sm px-2 -mx-2 py-1 rounded-md transition-colors hover:bg-line/30">
                                                    <span className="truncate pr-3">{c.name}</span>
                                                    <span className="text-ash whitespace-nowrap">
                                                        {c.transaction_count} orders · <span className="price">{formatMoney(c.total_spend)}</span>
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Phase P8 (Analytics Visualization) - "Add seller
                                    leaderboard": platform-wide top 5 (public storefront
                                    info, same as admin sees) plus this seller's own
                                    rank/row highlighted even when it falls outside the
                                    top 5 - see seller.service.js's
                                    getSellerLeaderboardStanding. */}
                                {advancedAnalytics.leaderboardStanding && (
                                    <div className="border border-line rounded-lg p-4">
                                        <p className="text-sm font-medium mb-1">Seller leaderboard</p>
                                        <p className="text-xs text-ash mb-4">
                                            Ranked by blended product + service revenue, platform-wide.
                                        </p>
                                        {advancedAnalytics.leaderboardStanding.top.length === 0 ? (
                                            <p className="text-ash text-sm">No paid orders or bookings yet.</p>
                                        ) : (
                                            <ul className="space-y-2.5">
                                                {advancedAnalytics.leaderboardStanding.top.map((s) => (
                                                    <li
                                                        key={s.user_id}
                                                        className={`flex items-center gap-2 text-sm px-2 -mx-2 py-1 rounded-md ${
                                                            s.user_id === advancedAnalytics.leaderboardStanding.own?.user_id ? "bg-teal/10" : ""
                                                        }`}
                                                    >
                                                        <span className="text-ash text-xs w-5 shrink-0">{s.rank}</span>
                                                        <span className="flex-1 min-w-0 truncate">{s.store_name}</span>
                                                        <span className="price text-xs font-medium shrink-0">{formatMoney(s.total_revenue)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {advancedAnalytics.leaderboardStanding.own && advancedAnalytics.leaderboardStanding.own.rank > 5 && (
                                            <div className="mt-3 pt-3 border-t border-line flex items-center gap-2 text-sm bg-teal/10 -mx-2 px-2 py-1.5 rounded-md">
                                                <span className="text-ash text-xs w-5 shrink-0">{advancedAnalytics.leaderboardStanding.own.rank}</span>
                                                <span className="flex-1 min-w-0 truncate">
                                                    You · of {advancedAnalytics.leaderboardStanding.totalRankedSellers} ranked sellers
                                                </span>
                                                <span className="price text-xs font-medium shrink-0">
                                                    {formatMoney(advancedAnalytics.leaderboardStanding.own.total_revenue)}
                                                </span>
                                            </div>
                                        )}
                                        {!advancedAnalytics.leaderboardStanding.own && (
                                            <p className="text-xs text-ash mt-3">No paid revenue yet, so you're not ranked.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {showServices && bookingStats && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                        <Stat label="Booking revenue" value={formatMoney(bookingStats.grossBookingRevenue)} mono delay={0} />
                        <Stat label="Total bookings" value={bookingStats.totalBookings} delay={40} />
                        <Stat label="Pending bookings" value={bookingStats.pendingBookings} delay={80} />
                    </div>

                    <div className="border border-line rounded-lg p-4 mb-10 animate-slide-up hover:shadow-md transition-shadow" style={{ animationDelay: "320ms" }}>
                        <p className="text-sm font-medium mb-4">Booking revenue - last 30 days</p>
                        {bookingStats.dailyBookings.length === 0 ? (
                            <p className="text-ash text-sm">No paid bookings yet.</p>
                        ) : (
                            <>
                                <BarChart data={bookingStats.dailyBookings} labelKey="day" valueKey="amount" formatValue={formatMoney} />
                                <div className="flex justify-between text-xs text-ash mt-2">
                                    <span>{formatShortDate(bookingStats.dailyBookings[0].day)}</span>
                                    <span>{formatShortDate(bookingStats.dailyBookings[bookingStats.dailyBookings.length - 1].day)}</span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="border border-line rounded-lg p-4 animate-slide-up hover:shadow-md transition-shadow" style={{ animationDelay: "360ms" }}>
                        <p className="text-sm font-medium mb-4">Best-booked services</p>
                        {bookingStats.topServices.length === 0 ? (
                            <p className="text-ash text-sm">No bookings yet.</p>
                        ) : (
                            <ul className="space-y-3">
                                {bookingStats.topServices.map((s) => (
                                    <li key={s.id} className="flex items-center justify-between text-sm px-2 -mx-2 py-1 rounded-md transition-colors hover:bg-line/30">
                                        <span className="truncate pr-3">{s.name}</span>
                                        <span className="text-ash whitespace-nowrap">
                                            {s.bookings} booked · <span className="price">{formatMoney(s.revenue)}</span>
                                        </span>
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

function Stat({ label, value, sub, mono, delay = 0, highlight }) {
    return (
        <div
            className={`border rounded-lg p-4 animate-slide-up hover:-translate-y-0.5 hover:shadow-md transition-all ${highlight ? "border-teal/30 bg-teal/5" : "border-line"}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-xl font-medium ${mono ? "price" : "font-display"} ${highlight ? "text-teal" : ""}`}>{value}</p>
            {sub && <p className="text-xs text-ash mt-0.5">{sub}</p>}
        </div>
    );
}
