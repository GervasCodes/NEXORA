import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatShortDate } from "../../utils/format";
import BarChart from "../../components/BarChart";
import VerificationFeeGate from "../../components/VerificationFeeGate";

const STATUS_LABELS = {
    pending: "Pending",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
};

export default function SellerAnalytics() {
    const { profile, refreshProfile } = useOutletContext();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [feeRequired, setFeeRequired] = useState(null); // required_fee amount, or null if not locked

    const load = () => {
        setLoading(true);
        setError("");
        setFeeRequired(null);
        api.get("/seller/analytics")
            .then(({ data }) => setAnalytics(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "VERIFICATION_FEE_REQUIRED") {
                    setFeeRequired(err.response.data.required_fee);
                } else {
                    setError(extractErrorMessage(err));
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    if (loading) return <p className="text-ash">Loading analytics…</p>;

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
        <div>
            <h1 className="font-display text-2xl mb-1">Analytics</h1>
            <p className="text-ash text-sm mb-8">How {profile.store_name} is performing.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <Stat label="Gross sales" value={formatMoney(totals.grossSales)} mono />
                <Stat label={`Commission paid (${commissionRate}%)`} value={formatMoney(totals.commissionPaid)} mono />
                <Stat label="Net earnings" value={formatMoney(totals.netEarnings)} mono />
                <Stat label="Total orders" value={totals.totalOrders} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <Stat key={key} label={label} value={statusBreakdown[key] || 0} />
                ))}
            </div>

            <div className="border border-line rounded-lg p-4 mb-10">
                <p className="text-sm font-medium mb-4">Sales - last 30 days</p>
                <BarChart data={dailySales} labelKey="day" valueKey="amount" formatValue={formatMoney} />
                {dailySales.length > 0 && (
                    <div className="flex justify-between text-xs text-ash mt-2">
                        <span>{formatShortDate(dailySales[0].day)}</span>
                        <span>{formatShortDate(dailySales[dailySales.length - 1].day)}</span>
                    </div>
                )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="border border-line rounded-lg p-4">
                    <p className="text-sm font-medium mb-4">Best-selling products</p>
                    {topProducts.length === 0 ? (
                        <p className="text-ash text-sm">No sales yet.</p>
                    ) : (
                        <ul className="space-y-3">
                            {topProducts.map((p) => (
                                <li key={p.id} className="flex items-center justify-between text-sm">
                                    <span className="truncate pr-3">{p.name}</span>
                                    <span className="text-ash whitespace-nowrap">
                                        {p.units_sold} sold · <span className="price">{formatMoney(p.revenue)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="border border-line rounded-lg p-4">
                    <p className="text-sm font-medium mb-4">Customers</p>
                    <Stat label="Repeat customers" value={repeatCustomers} />
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, sub, mono }) {
    return (
        <div className="border border-line rounded-lg p-4">
            <p className="text-xs text-ash mb-1">{label}</p>
            <p className={`text-xl font-medium ${mono ? "price" : "font-display"}`}>{value}</p>
            {sub && <p className="text-xs text-ash mt-0.5">{sub}</p>}
        </div>
    );
}
