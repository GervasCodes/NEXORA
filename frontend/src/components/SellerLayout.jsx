import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useUnreadMessagesCount } from "../hooks/useUnreadMessagesCount";
import AccountReviewNotice from "./AccountReviewNotice";
import PageTransition from "./PageTransition";
import MobileBottomNav from "./MobileBottomNav";
import { HomeIcon, DashboardIcon, OrdersIcon, BookingsIcon, MessagesIcon, WalletIcon, AccountIcon } from "./NavIcons";

// Grouped rather than one flat list, so the mobile drawer reads as
// sections (like /admin's) instead of an 18-item horizontal-scroll
// strip with no indication there's more to the right, and so the
// mobile toggle bar can show the exact current page name instead of
// a generic "Seller" label.
//
// Merchant-Type-Aware Dashboard (Phase 1): each tab may carry a
// `category` of "product" or "service". A tab with no `category` is
// shared and always shown. Visibility is resolved against
// seller_profiles.merchant_type - see isTabVisible below. `hybrid`
// sellers see every tab, per CHANGES.md's Permission Matrix.
// Reviews/Service reviews, Collections/Sponsorship/Featured
// stores/Department sponsorship (all keyed off the product
// `categories` table - see departmentSponsorship/featuredStore
// repositories) and Delivery team/Disputes (order-only dispute
// types) follow the same product/service split as the Catalog and
// Orders groups they sit alongside.
//
// `selfGated: true` marks tabs whose page already renders its own
// merchant-type fallback UI (an upgrade prompt or explanatory empty
// state - see SellerServices/SellerBookings/SellerAvailability/
// SellerPricing) instead of a hard redirect. Those pages stay
// reachable by direct URL even when their tab is hidden, so we don't
// duplicate or override that existing behavior; see the
// direct-access guard effect below for the tabs that don't have one
// and still need a redirect.
const groups = [
    {
        label: "Overview",
        tabs: [
            { to: "/seller", label: "Overview", end: true },
            { to: "/seller/analytics", label: "Analytics" },
            { to: "/seller/wallet", label: "Wallet" }
        ]
    },
    {
        label: "Catalog",
        tabs: [
            { to: "/seller/products", label: "Products", category: "product" },
            { to: "/seller/services", label: "Services", category: "service", selfGated: true },
            { to: "/seller/availability", label: "Availability", category: "service", selfGated: true },
            { to: "/seller/pricing", label: "Pricing", category: "service", selfGated: true },
            { to: "/seller/collections", label: "Collections", category: "product" }
        ]
    },
    {
        label: "Orders",
        tabs: [
            { to: "/seller/bookings", label: "Bookings", category: "service", selfGated: true },
            { to: "/seller/orders", label: "Orders", category: "product" },
            { to: "/seller/delivery-team", label: "Delivery team", category: "product" },
            { to: "/seller/disputes", label: "Disputes", category: "product" }
        ]
    },
    {
        label: "Reviews",
        tabs: [
            { to: "/seller/reviews", label: "Reviews", category: "product" },
            { to: "/seller/service-reviews", label: "Service reviews", category: "service" }
        ]
    },
    {
        label: "Growth",
        tabs: [
            { to: "/seller/sponsorship", label: "Sponsorship", category: "product" },
            { to: "/seller/featured-store", label: "Featured stores", category: "product" },
            { to: "/seller/department-sponsorship", label: "Department sponsorship", category: "product" },
            { to: "/seller/subscription", label: "Subscription" }
        ]
    },
    {
        label: "Settings",
        tabs: [
            { to: "/seller/store", label: "Store settings" }
        ]
    }
];

const allTabs = groups.flatMap((g) => g.tabs);

function tabIsActive(tab, pathname) {
    return tab.end ? pathname === tab.to : pathname.startsWith(tab.to);
}

// A tab with no category is shared; hybrid sellers get everything;
// otherwise the tab's category must match the seller's merchant_type.
function isTabVisible(tab, merchantType) {
    if (!tab.category) return true;
    if (merchantType === "hybrid") return true;
    return tab.category === merchantType;
}

function visibleGroups(merchantType) {
    return groups
        .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => isTabVisible(tab, merchantType)) }))
        .filter((group) => group.tabs.length > 0);
}

export default function SellerLayout() {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const isApproved = user?.account_verification_status === "approved";

    // Close the drawer on every navigation, so it never sits open behind
    // a page the seller didn't mean to open it on.
    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!drawerOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") setDrawerOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [drawerOpen]);

    const currentTab = allTabs.find((tab) => tabIsActive(tab, location.pathname));

    const loadProfile = () => {
        if (!isApproved) {
            setLoading(false);
            return;
        }
        setLoading(true);
        api.get("/seller/profile")
            .then(({ data }) => setProfile(data.data))
            .catch(() => setProfile(null))
            .finally(() => setLoading(false));
    };

    useEffect(loadProfile, [isApproved]);

    useEffect(() => {
        if (isApproved && !loading && !profile && location.pathname !== "/seller/setup") {
            navigate("/seller/setup", { replace: true });
        }
    }, [isApproved, loading, profile, location.pathname, navigate]);

    const merchantType = profile?.merchant_type || "product";
    const unreadMessages = useUnreadMessagesCount(true);

    // Seller's mobile bottom nav (Phase 6: Mobile Navigation
    // Unification) - the Orders/Bookings slot follows the seller's own
    // merchant_type, same category logic the sidebar/drawer tabs above
    // already use: a service-only seller's most-reached-for list is
    // their bookings, not an orders page they'd immediately get
    // redirected out of (see the direct-access guard effect below).
    // Hybrid sellers default to Orders, matching this layout's own
    // "Orders" group ordering.
    const sellerBottomNavItems = [
        { to: "/seller", label: "Home", icon: DashboardIcon, end: true },
        merchantType === "service"
            ? { to: "/seller/bookings", label: "Bookings", icon: BookingsIcon }
            : { to: "/seller/orders", label: "Orders", icon: OrdersIcon },
        { to: "/messages", label: "Messages", icon: MessagesIcon, badge: unreadMessages > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-coral text-frost text-[9px] font-mono font-semibold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
        ) },
        { to: "/seller/wallet", label: "Wallet", icon: WalletIcon },
        { to: "/account", label: "Profile", icon: AccountIcon }
    ];

    // Phase 1 direct-access guard: only for tabs whose page has no
    // merchant-type fallback UI of its own (selfGated tabs - Services,
    // Bookings, Availability, Pricing - are intentionally left alone so
    // their existing upgrade-prompt/empty-state behavior isn't
    // overridden). Anyone hitting a product-only or service-only route
    // that doesn't match their merchant_type gets sent back to the
    // overview instead of a page built for the other merchant type.
    useEffect(() => {
        if (!profile) return;
        const blockedTab = allTabs.find(
            (tab) => tab.category && !tab.selfGated && !isTabVisible(tab, merchantType) && tabIsActive(tab, location.pathname)
        );
        if (blockedTab) {
            navigate("/seller", { replace: true });
        }
    }, [profile, merchantType, location.pathname, navigate]);

    if (!isApproved) {
        return (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
                <AccountReviewNotice
                    status={user?.account_verification_status}
                    rejectionReason={user?.account_verification_rejection_reason}
                    roleLabel="seller"
                />
            </div>
        );
    }

    if (loading) {
        return <div className="max-w-5xl mx-auto px-6 py-16 text-ash">Loading your store…</div>;
    }

    if (!profile && location.pathname === "/seller/setup") {
        return <Outlet context={{ profile, refreshProfile: loadProfile }} />;
    }

    if (!profile) {
        return null;
    }

    const verifiedBadge = profile.is_verified ? (
        <span className="text-teal">✓ Verified Seller</span>
    ) : (
        <span className="text-ash">
            Badge available ·{" "}
            <NavLink to="/seller/analytics" className="text-azure hover:underline">
                pay the fee
            </NavLink>
        </span>
    );

    return (
        <div className="max-w-6xl mx-auto sm:px-6 sm:py-8 grid md:grid-cols-[200px_1fr] gap-8 md:h-[calc(100vh-5rem)] md:overflow-hidden">
            {/* Mobile: a single toggle bar showing the current page, opening
                a grouped drawer - replaces what used to be a cramped
                horizontally-scrolling strip of all 18 tabs at equal weight
                with no hint there was more off-screen. Desktop keeps the
                original always-visible sidebar below, untouched. */}
            <div className="md:hidden glass-strong border-b border-line/60 px-4 py-3">
                <div className="flex items-center gap-2">
                    <Link
                        to="/"
                        aria-label="Home"
                        title="Home"
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-ink/70 hover:text-ink hover:bg-line/50 focus-ring transition-colors"
                    >
                        <HomeIcon className="w-5 h-5" />
                    </Link>
                    <button
                        type="button"
                        onClick={() => setDrawerOpen((v) => !v)}
                        aria-expanded={drawerOpen}
                        aria-controls="seller-mobile-drawer"
                        className="flex-1 min-w-0 flex items-center justify-between gap-3 focus-ring rounded-md"
                    >
                        <span className="min-w-0 text-left">
                            <span className="block text-xs uppercase tracking-widest text-ash">
                                {profile.store_name}
                            </span>
                            <span className="block font-display text-lg truncate">
                                {currentTab?.label ?? "Seller"}
                            </span>
                        </span>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`w-5 h-5 shrink-0 text-ink/70 transition-transform ${drawerOpen ? "rotate-180" : ""}`}
                        >
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>
                </div>

                {drawerOpen && (
                    <nav
                        id="seller-mobile-drawer"
                        className="mt-3 pt-3 border-t border-line/60 max-h-[70vh] overflow-y-auto"
                    >
                        <p className="text-xs mb-3">{verifiedBadge}</p>
                        {visibleGroups(merchantType).map((group) => (
                            <div key={group.label} className="mb-4 last:mb-0">
                                <p className="text-xs uppercase tracking-widest text-ash mb-1.5">{group.label}</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {group.tabs.map((tab) => (
                                        <NavLink
                                            key={tab.to}
                                            to={tab.to}
                                            end={tab.end}
                                            className={({ isActive }) =>
                                                `text-sm px-3 py-2 rounded-md transition-colors ${
                                                    isActive ? "bg-ink text-paper" : "bg-paper text-ink/80 border border-line/60"
                                                }`
                                            }
                                        >
                                            {tab.label}
                                        </NavLink>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </nav>
                )}
            </div>

            {/* Desktop sidebar - unchanged look, now fed from the same
                grouped `groups` data as the mobile drawer so the two can
                never drift out of sync with each other. */}
            <aside className="hidden md:block glass-strong rounded-lg p-4 md:h-full md:overflow-y-auto">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs uppercase tracking-widest text-ash">Seller</p>
                    <Link
                        to="/"
                        aria-label="Back to Home"
                        title="Back to Home"
                        className="shrink-0 -mt-1 -mr-1 w-7 h-7 flex items-center justify-center rounded-md text-ink/60 hover:text-ink hover:bg-line/50 focus-ring transition-colors"
                    >
                        <HomeIcon className="w-4 h-4" />
                    </Link>
                </div>
                <p className="font-display text-lg mb-1 truncate">{profile.store_name}</p>
                <p className="text-xs mb-6">{verifiedBadge}</p>

                <nav className="flex flex-col gap-4">
                    {visibleGroups(merchantType).map((group) => (
                        <div key={group.label}>
                            <p className="text-[11px] uppercase tracking-widest text-ash/80 mb-1 px-3">{group.label}</p>
                            <div className="flex flex-col gap-1">
                                {group.tabs.map((tab) => (
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
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>

            <div className="min-w-0 px-4 py-4 sm:px-0 sm:py-0 md:h-full md:overflow-y-auto">
                <PageTransition granular>
                    <Outlet context={{ profile, refreshProfile: loadProfile }} />
                </PageTransition>
            </div>

            <MobileBottomNav items={sellerBottomNavItems} />
        </div>
    );
}
