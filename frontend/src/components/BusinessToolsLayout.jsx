import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import PageTransition from "./PageTransition";
import TrialBanner from "./TrialBanner";

// Dashboard for "business tools only" accounts (migration 146): a seller-role
// account that uses stock/sales tooling without a marketplace store. It has
// no store, no marketplace review and none of the marketplace-only screens -
// those live under /seller, which sends these accounts back here.
export default function BusinessToolsLayout() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    // Once converted to a marketplace seller the same POS lives under /seller.
    if (user && user.seller_mode !== "business_tools") {
        return <Navigate to="/seller/pos" replace />;
    }

    const tabs = [
        { to: "/business", label: t("business.navStock"), end: true },
        { to: "/business/plan", label: t("business.navPlan") },
        { to: "/business/upgrade", label: t("business.navUpgrade") }
    ];

    const signOut = () => {
        logout();
        navigate("/");
    };

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex items-center justify-between gap-4 mb-4">
                <p className="text-xs uppercase tracking-widest text-ash">
                    <Link to="/" className="hover:text-ink">NEXORA</Link> · {t("business.layoutTitle")}
                </p>
                <button type="button" onClick={signOut} className="text-sm text-ash hover:text-ink">
                    {t("business.signOut")}
                </button>
            </div>

            <nav className="flex gap-1 mb-8 border-b border-line overflow-x-auto">
                {tabs.map((tab) => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        end={tab.end}
                        className={({ isActive }) =>
                            `shrink-0 whitespace-nowrap text-sm px-4 py-3 -mb-px border-b-2 transition-colors ${
                                isActive ? "border-mango text-ink font-medium" : "border-transparent text-ash hover:text-ink"
                            }`
                        }
                    >
                        {tab.label}
                    </NavLink>
                ))}
            </nav>

            <TrialBanner plansPath="/business/plan" />

            <PageTransition granular>
                <Outlet />
            </PageTransition>
        </div>
    );
}
