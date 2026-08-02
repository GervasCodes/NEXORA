import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatShortDate } from "../../utils/format";
import BarChart from "../../components/BarChart";
import VerificationFeeGate from "../../components/VerificationFeeGate";
import PageLoader from "../../components/PageLoader";

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [feeRequired, setFeeRequired] = useState(null); // required_fee amount, or null if not locked

    const load = () => {
        setLoading(true);
        setError("");
        setFeeRequired(null);
        api.get("/seller/analytics")
            .then(({ data }) => {
                setAnalytics(data.data);
                return showServices ? api.get("/bookings/provider/mine") : null;
            })
            .then((res) => {
                if (res) setBookingStats(summarizeBookings(res.data.data));
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

    useEffect(load, [showServices]);

    if (loading) return <PageLoader />;

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
            <h1 className="font-display text-2xl mb-1">Analytics</h1>
            <p className="text-ash text-sm mb-8">How {profile.store_name} is performing.</p>

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
                        <p className="text-sm font-medium mb-4">Sales - last 30 days</p>
                        <BarChart data={dailySales} labelKey="day" valueKey="amount" formatValue={formatMoney} />
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
