import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney } from "../../utils/format";

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/admin/dashboard").then(({ data }) => setStats(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading dashboard…</p>;
    if (!stats) return <p className="text-coral">Couldn't load dashboard stats.</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-8">Platform overview</h1>

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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Stat label="Total products" value={stats.products.total} />
                <Stat label="Active products" value={stats.products.active} />
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
