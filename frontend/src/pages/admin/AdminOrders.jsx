import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/admin/orders").then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading orders…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">All orders</h1>

            {orders.length === 0 && <p className="text-ash text-sm">No orders yet.</p>}

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((o) => (
                    <li key={o.id} className="py-3 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="price text-sm font-medium">{o.order_number}</p>
                            <p className="text-xs text-ash truncate">{o.first_name} {o.last_name} · {o.email}</p>
                        </div>

                        <p className="text-xs text-ash">{formatDate(o.created_at)}</p>

                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[o.status] || "bg-line text-ash"}`}>
                            {o.status}
                        </span>

                        <span className="text-xs text-ash capitalize">{o.payment_status}</span>

                        <p className="price text-sm font-medium">{formatMoney(o.total_amount)}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
