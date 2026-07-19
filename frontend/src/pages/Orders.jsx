import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { SkeletonList } from "../components/Skeleton";

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

export default function Orders() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/orders").then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <div className="h-9 w-40 skeleton animate-shimmer rounded-md mb-8" />
                <SkeletonList rows={4} />
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-24 text-center animate-slide-up">
                <p className="font-display text-2xl mb-2">{t("orders.empty")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.startShopping")}</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
            <h1 className="font-display text-3xl mb-8">{t("orders.title")}</h1>

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((order, i) => (
                    <li key={order.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                        <Link to={`/orders/${order.id}`} className="py-4 flex items-center justify-between gap-4 hover:bg-line/20 active:scale-[0.99] transition-all -mx-2 px-2 rounded-md">
                            <div>
                                <p className="text-sm font-medium price">{order.order_number}</p>
                                <p className="text-xs text-ash mt-0.5">{formatDate(order.created_at)}</p>
                            </div>
                            {order.is_parent ? (
                                <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize bg-teal/10 text-teal">
                                    {t("orders.vendorsBadge", { count: order.vendor_count })}
                                </span>
                            ) : (
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${statusStyles[order.status] || "bg-line text-ash"}`}>
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
