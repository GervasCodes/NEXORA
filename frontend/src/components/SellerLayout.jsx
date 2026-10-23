import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import AccountReviewNotice from "./AccountReviewNotice";
import TrialBanner from "./TrialBanner";
import PageTransition from "./PageTransition";
import ConfirmDialog from "./ConfirmDialog";
import SideDrawer from "./ui/SideDrawer";
import { HomeIcon, AccountIcon, SignOutIcon } from "./NavIcons";
import { CheckIcon } from "./Icons";
import { getVerificationTier } from "../utils/verificationTier";
import useSellerAccess from "../hooks/useSellerAccess";
import { useLanguage } from "../context/LanguageContext";

// Grouped rather than one flat list, so the mobile drawer reads as
// sections (like /admin's) instead of an 18-item horizontal-scroll
// strip with no indication there's more to the right, and so the
// mobile toggle bar can show the exact current page name instead of
// a generic "Seller" label.
//
// Merchant-Type-Aware Dashboard  each tab may carry a
// `category` of "product" or "service". A tab with no `category` is
// shared and always shown. Visibility is resolved against
// seller_profiles.merchant_type - see isTabVisible below. `hybrid`
// sellers see every tab, per CHANGES.md's Permission Matrix.
// Reviews/Service reviews, Collections/Promote (sponsorship and featured
// stores are tabs within it - see
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
        key: "sell",
        label: "Sell",
        tabs: [
            { to: "/seller", label: "Overview", end: true },
            { to: "/seller/products", label: "Products", category: "product" },
            { to: "/seller/services", label: "Services", category: "service", selfGated: true },
            { to: "/seller/availability", label: "Availability", category: "service", selfGated: true },
            { to: "/seller/pricing", label: "Pricing", category: "service", selfGated: true },
            { to: "/seller/collections", label: "Collections", category: "product" },
            { to: "/seller/orders", label: "Orders", category: "product" },
            { to: "/seller/bookings", label: "Bookings", category: "service", selfGated: true },
            { to: "/seller/delivery-team", label: "Delivery team", category: "product" },
            { to: "/seller/returns", label: "Returns", category: "product" },
            { to: "/seller/disputes", label: "Disputes", category: "product" },
            { to: "/seller/reviews", label: "Reviews", category: "product" },
            { to: "/seller/service-reviews", label: "Service reviews", category: "service" }
        ]
    },
    {
        key: "money",
        label: "Money",
        tabs: [
            { to: "/seller/wallet", label: "Wallet" },
            { to: "/seller/tax-info", label: "Tax & receipts" },
            { to: "/seller/pos", label: "Stock & sales", category: "product" },
            { to: "/seller/subscription", label: "Subscription" }
        ]
    },
    {
        key: "growth",
        label: "Growth",
        tabs: [
            { to: "/seller/analytics", label: "Analytics" },
            { to: "/seller/promote", label: "Promote", category: "product" },
            { to: "/seller/group-buys", label: "Group buys", category: "product" },
            { to: "/seller/live-selling", label: "Live selling", category: "product" }
        ]
    },
    {
        key: "settings",
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

// Compact trial / plan status shown at the top of the seller menu. Reads the
// same access state as TrialBanner (shared cached request). A seller on a
// paid plan, or whose state hasn't loaded, sees nothing.
function SellerPlanStatus({ onNavigate }) {
    const { t } = useLanguage();
    const access = useSellerAccess();
    if (!access || access.hasPaidPlan) return null;

    let tone;
    let title;
    if (access.inTrial) {
        const days = Number(access.daysLeft) || 1;
        tone = "border-teal/30 bg-teal/5 text-teal";
        title = days === 1 ? t("trial.banner.daysLeftOne") : t("trial.banner.daysLeft", { days });
    } else if (access.trialUsed) {
        tone = "border-mango/40 bg-mango/10 text-ink";
        title = t("seller.menu.trialEnded");
    } else {
        return null;
    }

    return (
        <NavLink
            to="/seller/subscription"
            onClick={onNavigate}
            className={`mb-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-medium focus-ring ${tone}`}
        >
            <span className="min-w-0">{title}</span>
            <span className="shrink-0 text-azure">{t("trial.banner.choosePlan")}</span>
        </NavLink>
    );
}

// Tab list shared by the desktop rail and the mobile drawer. Each group is a
// collapsible section: only the group holding the current page starts open,
// so the menu stays short. "rail" is a vertical list; "drawer" keeps the
// two-column pill layout.
function SellerNavGroups({ groups, variant, pathname }) {
    const { t } = useLanguage();
    const activeKey = useMemo(
        () => groups.find((g) => g.tabs.some((tab) => tabIsActive(tab, pathname)))?.key ?? groups[0]?.key,
        [groups, pathname]
    );
    const [openKeys, setOpenKeys] = useState(() => new Set([activeKey]));

    // Navigating into another group (search jump, link inside a page) opens
    // it; groups the seller opened by hand stay open.
    useEffect(() => {
        setOpenKeys((prev) => (prev.has(activeKey) ? prev : new Set(prev).add(activeKey)));
    }, [activeKey]);

    const toggle = (key) =>
        setOpenKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return groups.map((group) => {
        const open = openKeys.has(group.key);
        const panelId = `seller-nav-${variant}-${group.key}`;
        return (
            <div key={group.key} className="mb-2 last:mb-0">
                <button
                    type="button"
                    onClick={() => toggle(group.key)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="w-full flex items-center justify-between gap-2 min-h-[40px] px-1 text-xs uppercase tracking-widest text-ash hover:text-ink focus-ring rounded-md"
                >
                    <span>{t(`seller.menu.${group.key}`)}</span>
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                        className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`}
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
                {open && (
                    <div id={panelId} className={`mt-1 ${variant === "rail" ? "flex flex-col gap-0.5" : "grid grid-cols-2 gap-1.5"}`}>
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
                )}
            </div>
        );
    });
}

export default function SellerLayout() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [shareNote, setShareNote] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const isApproved = user?.account_verification_status === "approved";
    // Business-tools-only accounts (migration 146) have no store or marketplace
    // review - they live in their own light dashboard.
    const isToolsOnly = user?.seller_mode === "business_tools";
    useEffect(() => {
        if (isToolsOnly) navigate("/business", { replace: true });
    }, [isToolsOnly, navigate]);

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

    if (isToolsOnly) return null;

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
    const verifiedBadge = verificationTier ? (
        <span className="text-teal inline-flex items-center gap-1">
            <CheckIcon className="w-3.5 h-3.5" /> {t("verification.sellerBadge")}
        </span>
    ) : profile.is_verified ? (
        <span className="text-ash">
            {t("sellerBadge.none")} ·{" "}
            <NavLink to="/seller/verification" className="text-azure hover:underline">
                {t("sellerBadge.apply")}
            </NavLink>
        </span>
    ) : (
        <span className="text-ash">{t("sellerBadge.awaitingId")}</span>
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
                    <SellerPlanStatus onNavigate={() => setDrawerOpen(false)} />
                    <p className="text-xs mb-3">{verifiedBadge}</p>
                    <div className="mb-4 space-y-2">
                        <SellerSearch tabs={visibleTabs} onPick={(to) => { setDrawerOpen(false); navigate(to); }} />
                        {storeActions}
                    </div>
                    <SellerNavGroups groups={navGroups} variant="drawer" pathname={location.pathname} />

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
                        <SellerPlanStatus />
                        <p className="text-xs mb-3 px-1">{verifiedBadge}</p>
                        <p className="text-xs uppercase tracking-widest text-ash px-1 mb-2 truncate">{profile.store_name}</p>
                        <SellerNavGroups groups={navGroups} variant="rail" pathname={location.pathname} />
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
                        <TrialBanner />
                        <PageTransition granular>
                            <Outlet context={{ profile, refreshProfile: loadProfile }} />
                        </PageTransition>
                    </div>
                </div>
            </div>

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
