import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api from "../../api/client";
import { formatMoney } from "../../utils/format";

export default function SellerOverview() {
    const { profile } = useOutletContext();
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get("/products/mine/list"),
            api.get("/orders/seller/list")
        ]).then(([p, o]) => {
            setProducts(p.data.data);
            setOrders(o.data.data);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading overview…</p>;

    const activeProducts = products.filter((p) => p.is_active).length;
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const revenue = orders
        .filter((o) => o.payment_status === "paid")
        .reduce((sum, o) => sum + Number(o.total_amount), 0);

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Welcome back</h1>
            <p className="text-ash text-sm mb-8">Here's how {profile.store_name} is doing.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                <Stat label="Products" value={products.length} sub={`${activeProducts} active`} />
                <Stat label="Orders" value={orders.length} sub={`${pendingOrders} pending`} />
                <Stat label="Revenue" value={formatMoney(revenue)} mono />
                <Stat label="Status" value={profile.is_verified ? "Verified" : "Pending"} />
            </div>

            <div className="flex gap-3">
                <Link to="/seller/products/new" className="bg-mango text-abyss px-5 py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors">
                    List a new product
                </Link>
                <Link to="/seller/orders" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                    View orders
                </Link>
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
