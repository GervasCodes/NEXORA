import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api from "../../api/client";
import { formatMoney } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";

// Merchant-Type-Aware Dashboard (Phase 4) - the same product/service
// split SellerLayout's tabs already use (seller_profiles.merchant_type),
// applied to the Overview stat cards and quick actions instead of nav
// visibility. `hybrid` gets both sections; `product`/`service` only
// fetch and render the section that applies to them, so a service-only
// seller no longer loads /products/mine/list and /orders/seller/list
// (data that would just render as an irrelevant "0 products" card) and
// vice versa for a product-only seller and bookings. Reuses the exact
// endpoints SellerProducts/SellerOrders/SellerBookings/SellerServices
// already call - no new queries.
export default function SellerOverview() {
    const { user } = useAuth();
    const { profile } = useOutletContext();
    const merchantType = profile?.merchant_type || "product";
    const showProducts = merchantType === "product" || merchantType === "hybrid";
    const showServices = merchantType === "service" || merchantType === "hybrid";

    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [services, setServices] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const calls = [];
        calls.push(showProducts ? api.get("/products/mine/list") : Promise.resolve({ data: { data: [] } }));
        calls.push(showProducts ? api.get("/orders/seller/list") : Promise.resolve({ data: { data: [] } }));
        calls.push(showServices ? api.get("/services/mine/list") : Promise.resolve({ data: { data: [] } }));
        calls.push(showServices ? api.get("/bookings/provider/mine") : Promise.resolve({ data: { data: [] } }));

        Promise.all(calls).then(([p, o, sv, b]) => {
            setProducts(p.data.data);
            setOrders(o.data.data);
            setServices(sv.data.data);
            setBookings(b.data.data);
        }).finally(() => setLoading(false));
    }, [showProducts, showServices]);

    if (loading) return <PageLoader />;

    const activeProducts = products.filter((p) => p.is_active).length;
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const productRevenue = orders
        .filter((o) => o.payment_status === "paid")
        .reduce((sum, o) => sum + Number(o.total_amount), 0);

    const activeServices = services.filter((s) => s.is_active).length;
    const pendingBookings = bookings.filter((b) => b.status === "pending").length;
    const serviceRevenue = bookings
        .filter((b) => b.payment_status === "paid")
        .reduce((sum, b) => sum + Number(b.amount), 0);

    return (
        <div>
            <PageMeta title="Seller Dashboard" noIndex />
            <h1 className="font-display text-2xl mb-1">{user?.first_name ? `Welcome back, ${user.first_name}` : "Welcome back"}</h1>
            <p className="text-ash text-sm mb-8">Here's how {profile.store_name} is doing.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                {showProducts && (
                    <>
                        <Stat label="Products" value={products.length} sub={`${activeProducts} active`} />
                        <Stat label="Orders" value={orders.length} sub={`${pendingOrders} pending`} />
                        <Stat label="Revenue" value={formatMoney(productRevenue)} mono />
                    </>
                )}

                {showServices && (
                    <>
                        <Stat label="Services" value={services.length} sub={`${activeServices} active`} />
                        <Stat label="Bookings" value={bookings.length} sub={`${pendingBookings} pending`} />
                        <Stat label="Booking revenue" value={formatMoney(serviceRevenue)} mono />
                    </>
                )}

                <Stat label="Status" value={profile.is_verified ? "Verified" : "Pending"} />
            </div>

            <div className="flex flex-wrap gap-3">
                {showProducts && (
                    <>
                        <Button as={Link} to="/seller/products/new" size="sm">
                            List a new product
                        </Button>
                        <Link to="/seller/orders" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                            View orders
                        </Link>
                    </>
                )}

                {showServices && (
                    <>
                        <Button as={Link} to="/seller/services/new" size="sm">
                            List a new service
                        </Button>
                        <Link to="/seller/bookings" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                            View bookings
                        </Link>
                        <Link to="/seller/availability" className="border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-ink transition-colors">
                            Manage availability
                        </Link>
                    </>
                )}
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
