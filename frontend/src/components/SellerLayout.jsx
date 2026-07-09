import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import api from "../api/client";

const tabs = [
    { to: "/seller", label: "Overview", end: true },
    { to: "/seller/products", label: "Products" },
    { to: "/seller/orders", label: "Orders" },
    { to: "/seller/delivery-team", label: "Delivery team" },
    { to: "/seller/store", label: "Store settings" }
];

export default function SellerLayout() {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    const loadProfile = () => {
        setLoading(true);
        api.get("/seller/profile")
            .then(({ data }) => setProfile(data.data))
            .catch(() => setProfile(null))
            .finally(() => setLoading(false));
    };

    useEffect(loadProfile, []);

    useEffect(() => {
        if (!loading && !profile && location.pathname !== "/seller/setup") {
            navigate("/seller/setup", { replace: true });
        }
    }, [loading, profile, location.pathname, navigate]);

    if (loading) {
        return <div className="max-w-5xl mx-auto px-6 py-16 text-ash">Loading your store…</div>;
    }

    if (!profile && location.pathname === "/seller/setup") {
        return <Outlet context={{ profile, refreshProfile: loadProfile }} />;
    }

    if (!profile) {
        return null;
    }

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-[180px_1fr] gap-8">
            <aside>
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Seller</p>
                <p className="font-display text-lg mb-1 truncate">{profile.store_name}</p>
                <p className="text-xs mb-6">
                    {profile.is_verified ? (
                        <span className="text-teal">✓ Verified store</span>
                    ) : (
                        <span className="text-ash">Pending verification</span>
                    )}
                </p>
                <nav className="flex md:flex-col gap-1 overflow-x-auto">
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            end={tab.end}
                            className={({ isActive }) =>
                                `text-sm px-3 py-2 rounded-md whitespace-nowrap transition-colors ${
                                    isActive ? "bg-ink text-paper" : "text-ink/80 hover:bg-line/50"
                                }`
                            }
                        >
                            {tab.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <div className="min-w-0">
                <Outlet context={{ profile, refreshProfile: loadProfile }} />
            </div>
        </div>
    );
}
