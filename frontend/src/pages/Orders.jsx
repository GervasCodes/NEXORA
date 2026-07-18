import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

export default function Orders() {
    const { format } = useCurrency();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/orders").then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="max-w-3xl mx-auto px-6 py-16 text-ash">Loading orders…</div>;

    if (orders.length === 0) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">No orders yet</p>
                <Link to="/" className="text-teal hover:underline text-sm">Start shopping</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <h1 className="font-display text-3xl mb-8">Your orders</h1>

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((order) => (
                    <li key={order.id}>
                        <Link to={`/orders/${order.id}`} className="py-4 flex items-center justify-between gap-4 hover:bg-line/20 transition-colors -mx-2 px-2 rounded-md">
                            <div>
                                <p className="text-sm font-medium price">{order.order_number}</p>
                                <p className="text-xs text-ash mt-0.5">{formatDate(order.created_at)}</p>
                            </div>
                            {order.is_parent ? (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize bg-teal/10 text-teal">
                                    {order.vendor_count} vendors
                                </span>
                            ) : (
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[order.status] || "bg-line text-ash"}`}>
                                    {order.status}
                                </span>
                            )}
                            <p className="price text-sm font-medium">{format(order.total_amount)}</p>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
