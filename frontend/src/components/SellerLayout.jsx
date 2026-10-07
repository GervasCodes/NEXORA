import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useUnreadMessagesCount } from "../hooks/useUnreadMessagesCount";
import AccountReviewNotice from "./AccountReviewNotice";
import PageTransition from "./PageTransition";
import MobileBottomNav from "./MobileBottomNav";
import ConfirmDialog from "./ConfirmDialog";
import SideDrawer from "./ui/SideDrawer";
import { HomeIcon, DashboardIcon, OrdersIcon, BookingsIcon, MessagesIcon, WalletIcon, AccountIcon, SignOutIcon } from "./NavIcons";
import { CheckIcon } from "./Icons";
import { getVerificationTier } from "../utils/verificationTier";

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
// Reviews/Service reviews, Collections/Promote (sponsorship, featured
// stores, and department sponsorship are tabs within it - see
// SellerPromote.jsx) and Delivery team/Disputes (order-only dispute
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
            { to: "/seller/wallet", label: "Wallet" },
            { to: "/seller/tax-info", label: "Tax & receipts" }
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
            { to: "/seller/disputes", label: "Disputes", category: "product" },
            { to: "/seller/returns", label: "Returns", category: "product" },
            { to: "/seller/group-buys", label: "Group buys", category: "product" },
            { to: "/seller/live-selling", label: "Live selling", category: "product" }
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
            { to: "/seller/promote", label: "Promote", category: "product" },
            { to: "/seller/subscription", label: "Subscription" }
        ]
    },
    {
        label: "Settings",
        tabs: [
            { to: "/seller/store", label: "Store settings" },
            { to: "/seller/verification", label: "Verification" }
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

// Plus icon for the mobile "New listing" action in the bottom nav.
function PlusIcon({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

// Dashboard-wide jump search: matches tab labels and goes to the first hit on Enter.
function SellerSearch({ tabs, onPick }) {
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const matches = q ? tabs.filter((tab) => tab.label.toLowerCase().includes(q)).slice(0, 6) : [];

    const pick = (to) => {
        onPick(to);
        setQuery("");
    };

    return (
        <div className="relative">
            <input
                type="search"
                aria-label="Search your dashboard"
                placeholder="Search dashboard"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && matches[0]) pick(matches[0].to);
                    if (e.key === "Escape") setQuery("");
                }}
                className="w-full border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus-ring"
            />
            {matches.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-paper border border-line rounded-md shadow-md py-1">
                    {matches.map((tab) => (
                        <li key={tab.to}>
                            <button
                                type="button"
                                onClick={() => pick(tab.to)}
                                className="w-full text-left text-sm px-3 py-2 hover:bg-line/40"
                            >
                                {tab.label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// Tab list shared by the desktop rail and the mobile drawer.
// "rail" is a vertical list; "drawer" keeps the two-column pill layout.
function SellerNavGroups({ groups, variant }) {
    return groups.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
            <p className="text-xs uppercase tracking-widest text-ash mb-1.5">{group.label}</p>
            <div className={variant === "rail" ? "flex flex-col gap-0.5" : "grid grid-cols-2 gap-1.5"}>
                {group.tabs.map((tab) => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        end={tab.end}
                        className={({ isActive }) =>
                            variant === "rail"
                                ? `text-sm px-3 py-1.5 rounded-md transition-colors ${
                                    isActive ? "bg-ink text-paper" : "text-ink/80 hover:bg-line/40"
                                }`
                                : `text-sm px-3 py-2 rounded-md transition-colors ${
                                    isActive ? "bg-ink text-paper" : "bg-paper text-ink/80 border border-line/60"
                                }`
                        }
                    >
                        {tab.label}
                    </NavLink>
                ))}
            </div>
        </div>
    ));
}

export default function SellerLayout() {
    const { user, sessionReady, logout } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [shareNote, setShareNote] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const isApproved = user?.account_verification_status === "approved";

    // Account and sign-out live in the shell (not the global header) so a
    // seller has them inside their own dashboard.
    const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
    const confirmSignOut = () => {
        setSignOutConfirmOpen(false);
        setDrawerOpen(false);
        logout();
        navigate("/");
    };

    // Close the drawer on every navigation, so it never sits open behind
    // a page the seller didn't mean to open it on.
    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);

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
    const unreadMessages = useUnreadMessagesCount(sessionReady);
    const navGroups = visibleGroups(merchantType);
    const visibleTabs = navGroups.flatMap((group) => group.tabs);

    // Public store page and share link. Hidden until the store has a slug.
    const storeUrl = profile?.store_slug ? `/stores/${profile.store_slug}` : null;
    const shareStore = async () => {
        const url = `${window.location.origin}${storeUrl}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: profile.store_name, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            setShareNote("Store link copied");
        } catch (err) {
            if (err?.name === "AbortError") return;
            setShareNote("Couldn't share - copy the link from the address bar");
        }
        setTimeout(() => setShareNote(""), 2500);
    };

    // Mobile bottom nav. The center "New" action opens the listing form for
    // the seller's merchant type (hybrid sellers default to products, like Orders).
    const newListingPath = merchantType === "service" ? "/seller/services/new" : "/seller/products/new";
    const sellerBottomNavItems = [
        { to: "/seller", label: "Home", icon: DashboardIcon, end: true },
        merchantType === "service"
            ? { to: "/seller/bookings", label: "Bookings", icon: BookingsIcon }
            : { to: "/seller/orders", label: "Orders", icon: OrdersIcon },
        { to: newListingPath, label: "New", icon: PlusIcon },
        { to: "/messages", label: "Messages", icon: MessagesIcon, badge: unreadMessages > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-coral text-frost text-[9px] font-mono font-semibold rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center">
                {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
        ) },
        { to: "/seller/wallet", label: "Wallet", icon: WalletIcon }
    ];

    // Direct-access guard: product-only or service-only routes that don't
    // match merchant_type go back to the overview. selfGated tabs keep their
    // own fallback UI.
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
        return (
            <div className="max-w-7xl mx-auto sm:px-6 sm:py-8 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6" aria-busy="true" aria-label="Loading your store">
                <div className="hidden md:block h-96 rounded-lg bg-line/40 animate-pulse" />
                <div className="px-4 py-4 sm:px-0 sm:py-0 space-y-4">
                    <div className="h-7 w-48 bg-line/60 rounded animate-pulse" />
                    <div className="h-4 w-72 bg-line/40 rounded animate-pulse" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-24 rounded-lg bg-line/40 animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!profile && location.pathname === "/seller/setup") {
        return <Outlet context={{ profile, refreshProfile: loadProfile }} />;
    }

    if (!profile) {
        return null;
    }

    const verificationTier = getVerificationTier(profile);
    const verifiedBadge = verificationTier === "business" ? (
        <span className="text-azure inline-flex items-center gap-1">
            <CheckIcon className="w-3.5 h-3.5" /> Verified Business
        </span>
    ) : verificationTier === "seller" ? (
        <span className="text-teal inline-flex items-center gap-1">
            <CheckIcon className="w-3.5 h-3.5" /> Verified Seller ·{" "}
            <NavLink to="/seller/verification" className="text-azure hover:underline">
                get Verified Business
            </NavLink>
        </span>
    ) : (
        <span className="text-ash">Awaiting ID verification</span>
    );

    const storeActions = storeUrl && (
        <div className="flex flex-wrap items-center gap-2">
            <Link
                to={storeUrl}
                className="text-sm border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors focus-ring"
            >
                View my store
            </Link>
            <button
                type="button"
                onClick={shareStore}
                className="text-sm border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors focus-ring"
            >
                Share store link
            </button>
            {shareNote && <span role="status" className="text-xs text-ash">{shareNote}</span>}
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto sm:px-6 sm:py-8">
            {/* Mobile toggle bar. On desktop the rail below replaces it. */}
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
                        aria-controls="seller-nav-drawer"
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
            </div>

            <SideDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                side="left"
                id="seller-nav-drawer"
                ariaLabel="Seller dashboard navigation"
                widthClassName="w-80 max-w-[85vw]"
            >
                <nav className="p-4">
                    <p className="text-xs mb-3">{verifiedBadge}</p>
                    <div className="mb-4 space-y-2">
                        <SellerSearch tabs={visibleTabs} onPick={(to) => { setDrawerOpen(false); navigate(to); }} />
                        {storeActions}
                    </div>
                    <SellerNavGroups groups={navGroups} variant="drawer" />

                    <div className="pt-3 border-t border-line/60 grid grid-cols-2 gap-1.5">
                        <Link
                            to="/account"
                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-paper text-ink/80 border border-line/60"
                        >
                            <AccountIcon className="w-4 h-4 shrink-0" />
                            Account
                        </Link>
                        <button
                            type="button"
                            onClick={() => setSignOutConfirmOpen(true)}
                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-paper text-coral border border-line/60"
                        >
                            <SignOutIcon className="w-4 h-4 shrink-0" />
                            Sign out
                        </button>
                    </div>
                </nav>
            </SideDrawer>

            <div className="md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6">
                {/* Desktop rail: always visible at md and up. */}
                <aside aria-label="Seller navigation" className="hidden md:block">
                    <div className="sticky top-4 border border-line rounded-lg p-3 max-h-[calc(100vh-2rem)] overflow-y-auto">
                        <p className="text-xs mb-3 px-1">{verifiedBadge}</p>
                        <p className="text-xs uppercase tracking-widest text-ash px-1 mb-2 truncate">{profile.store_name}</p>
                        <SellerNavGroups groups={navGroups} variant="rail" />
                        <div className="pt-3 mt-3 border-t border-line/60 space-y-0.5">
                            <Link to="/account" className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md text-ink/80 hover:bg-line/40">
                                <AccountIcon className="w-4 h-4 shrink-0" />
                                Account
                            </Link>
                            <button
                                type="button"
                                onClick={() => setSignOutConfirmOpen(true)}
                                className="w-full flex items-center gap-2 text-sm px-3 py-1.5 rounded-md text-coral hover:bg-line/40"
                            >
                                <SignOutIcon className="w-4 h-4 shrink-0" />
                                Sign out
                            </button>
                        </div>
                    </div>
                </aside>

                <div className="min-w-0">
                    <div className="hidden md:flex flex-wrap items-center gap-3 mb-6">
                        <div className="flex-1 min-w-[12rem] max-w-sm">
                            <SellerSearch tabs={visibleTabs} onPick={navigate} />
                        </div>
                        {storeActions}
                    </div>

                    <div className="min-w-0 px-4 py-4 sm:px-0 sm:py-0">
                        <PageTransition granular>
                            <Outlet context={{ profile, refreshProfile: loadProfile }} />
                        </PageTransition>
                    </div>
                </div>
            </div>

            <MobileBottomNav items={sellerBottomNavItems} />

            <ConfirmDialog
                open={signOutConfirmOpen}
                title="Sign out"
                description="You'll need to sign in again to access your seller dashboard."
                confirmLabel="Sign out"
                cancelLabel="Cancel"
                danger
                onConfirm={confirmSignOut}
                onCancel={() => setSignOutConfirmOpen(false)}
            />
        </div>
    );
}
