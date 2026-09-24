import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import PageTransition from "./PageTransition";
import ConfirmDialog from "./ConfirmDialog";
import NotificationBell from "./NotificationBell";
import SideDrawer from "./ui/SideDrawer";
import { useAuth } from "../context/AuthContext";
import { HomeIcon, AccountIcon, SignOutIcon } from "./NavIcons";

// Grouped rather than one flat list, so the mobile drawer reads as
// sections (like the rest of the app's nav) instead of a wall of 17
// same-weight links, and so the mobile toggle bar can show the exact
// current page name instead of a generic "Admin" label.
const groups = [
    {
        label: "Overview",
        tabs: [
            { to: "/admin", label: "Dashboard", end: true },
            { to: "/admin/dispatch", label: "Dispatch" }
        ]
    },
    {
        label: "Catalog",
        tabs: [
            { to: "/admin/products", label: "Products" },
            { to: "/admin/categories", label: "Categories" },
            { to: "/admin/service-categories", label: "Service categories" },
            { to: "/admin/services", label: "Services" },
            { to: "/admin/store-types", label: "Store types" }
        ]
    },
    {
        label: "Commerce",
        tabs: [
            { to: "/admin/orders", label: "Orders" },
            { to: "/admin/withdrawals", label: "Withdrawals" }
        ]
    },
    {
        label: "Growth",
        tabs: [
            { to: "/admin/sponsorship", label: "Sponsorship" },
            { to: "/admin/featured-stores", label: "Featured stores" },
            { to: "/admin/department-sponsorship", label: "Department sponsorship" },
            { to: "/admin/subscriptions", label: "Subscriptions" }
        ]
    },
    {
        label: "Trust & safety",
        tabs: [
            { to: "/admin/users", label: "Users" },
            { to: "/admin/users/map", label: "User map" },
            { to: "/admin/deleted-accounts", label: "Deleted accounts" },
            { to: "/admin/sellers", label: "Sellers" },
            { to: "/admin/delivery-agents", label: "Delivery agents" },
            { to: "/admin/account-verifications", label: "Verifications" },
            { to: "/admin/disputes", label: "Disputes" },
            { to: "/admin/returns", label: "Returns" },
            { to: "/admin/support", label: "Support" },
            { to: "/admin/efd", label: "EFD Tax" },
            { to: "/admin/pickup-points", label: "Pickup points" },
            { to: "/admin/content", label: "Guides" },
            { to: "/admin/fraud", label: "Fraud review" },
            { to: "/admin/fraud-dashboard", label: "Fraud dashboard" }
        ]
    },
    {
        label: "Platform",
        tabs: [
            { to: "/admin/admins", label: "Admins" },
            { to: "/admin/maintenance", label: "Maintenance" },
            { to: "/admin/status-incidents", label: "Status incidents" },
            { to: "/admin/audit-logs", label: "Audit logs" },
            { to: "/admin/data-reset", label: "Data reset" },
            { to: "/admin/broadcast", label: "Broadcast" },
            { to: "/admin/billing-control", label: "Billing control" },
            { to: "/admin/settings", label: "Settings" }
        ]
    }
];

const allTabs = groups.flatMap((g) => g.tabs);

function tabIsActive(tab, pathname) {
    return tab.end ? pathname === tab.to : pathname.startsWith(tab.to);
}

export default function AdminLayout() {
    const { pathname } = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { logout } = useAuth();
    const navigate = useNavigate();

    // Account/Sign-out used to live in the global Header alongside the
    // shopper-facing icons (Home/Browse/Cart/etc.) - out of place for an
    // admin who's living inside the Control room, not the storefront.
    // Both now live down here instead; see Header.jsx for the
    // corresponding removal for the admin role.
    const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
    const confirmSignOut = () => {
        setSignOutConfirmOpen(false);
        setDrawerOpen(false);
        logout();
        navigate("/");
    };

    // Close the drawer on every navigation, so it never sits open behind
    // a page the admin didn't mean to open it on.
    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);

    const currentTab = allTabs.find((tab) => tabIsActive(tab, pathname));

    return (
        <div className="max-w-6xl mx-auto sm:px-6 sm:py-8">
            {/* UI Modernization Phase 2: one persistent toggle bar at every
                breakpoint (previously mobile-only, with desktop instead
                getting a permanently-visible ~200px sidebar) feeding a
                single shared SideDrawer. Reclaims that column's width for
                content on desktop while keeping the toggle discoverable -
                it's a persistent, always-visible bar, not buried behind
                another control - per Phase 2's requirement. */}
            <div className="glass-strong border-b border-line/60 md:rounded-lg md:border px-4 py-3">
                <div className="flex items-center gap-2">
                    <Link
                        to="/"
                        aria-label="Home"
                        title="Home"
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-ink/70 hover:text-ink hover:bg-line/50 focus-ring transition-colors"
                    >
                        <HomeIcon className="w-5 h-5" />
                    </Link>
                    {/* NotificationBell's icon/badge colors (text-frost,
                        etc.) are built for the dark storefront Header it
                        used to live in exclusively - it never expected to
                        render on this panel's light glass-strong surface.
                        The dark chip gives it the same background it
                        always had, so it stays visible here without
                        needing a second, admin-specific color variant of
                        the component itself. */}
                    <div className="shrink-0 w-9 h-9 rounded-md bg-abyss flex items-center justify-center">
                        <NotificationBell />
                    </div>
                    <button
                        type="button"
                        onClick={() => setDrawerOpen((v) => !v)}
                        aria-expanded={drawerOpen}
                        aria-controls="admin-nav-drawer"
                        className="flex-1 min-w-0 flex items-center justify-between gap-3 focus-ring rounded-md"
                    >
                        <span className="min-w-0 text-left">
                            <span className="block text-xs uppercase tracking-widest text-ash">Control room</span>
                            <span className="block font-display text-lg truncate">
                                {currentTab?.label ?? "Control room"}
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
                id="admin-nav-drawer"
                ariaLabel="Control room navigation"
                widthClassName="w-80 max-w-[85vw]"
            >
                <nav className="p-4">
                    {groups.map((group) => (
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

            <div className="min-w-0 px-4 pb-6 pt-4 sm:px-0">
                <PageTransition granular>
                    <Outlet />
                </PageTransition>
            </div>

            <ConfirmDialog
                open={signOutConfirmOpen}
                title="Sign out"
                description="You'll need to sign in again to access the Control room."
                confirmLabel="Sign out"
                cancelLabel="Cancel"
                danger
                onConfirm={confirmSignOut}
                onCancel={() => setSignOutConfirmOpen(false)}
            />
        </div>
    );
}
