import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

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
            { to: "/admin/department-sponsorship", label: "Department sponsorship" }
        ]
    },
    {
        label: "Trust & safety",
        tabs: [
            { to: "/admin/users", label: "Users" },
            { to: "/admin/sellers", label: "Sellers" },
            { to: "/admin/account-verifications", label: "Verifications" },
            { to: "/admin/disputes", label: "Disputes" },
            { to: "/admin/fraud", label: "Fraud review" }
        ]
    },
    {
        label: "Platform",
        tabs: [
            { to: "/admin/admins", label: "Admins" },
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

    // Close the drawer on every navigation, so it never sits open behind
    // a page the admin didn't mean to open it on.
    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!drawerOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") setDrawerOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [drawerOpen]);

    const currentTab = allTabs.find((tab) => tabIsActive(tab, pathname));

    return (
        <div className="max-w-6xl mx-auto sm:px-6 sm:py-8 grid md:grid-cols-[200px_1fr] gap-8">
            {/* Mobile: a single toggle bar showing the current page, opening
                a grouped drawer - replaces what used to be a cramped
                horizontal-scrolling strip of all 17 tabs at equal weight
                crammed under a "Control room" heading. Desktop keeps the
                original always-visible sidebar below, untouched. */}
            <div className="md:hidden glass-strong border-b border-line/60 px-4 py-3">
                <button
                    type="button"
                    onClick={() => setDrawerOpen((v) => !v)}
                    aria-expanded={drawerOpen}
                    aria-controls="admin-mobile-drawer"
                    className="w-full flex items-center justify-between gap-3 focus-ring rounded-md"
                >
                    <span className="min-w-0 text-left">
                        <span className="block text-xs uppercase tracking-widest text-ash">Admin</span>
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

                {drawerOpen && (
                    <nav
                        id="admin-mobile-drawer"
                        className="mt-3 pt-3 border-t border-line/60 max-h-[70vh] overflow-y-auto"
                    >
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
                    </nav>
                )}
            </div>

            {/* Desktop sidebar - unchanged layout, just now fed from the
                same grouped `groups` data as the mobile drawer so the two
                can never drift out of sync with each other. */}
            <aside className="hidden md:block glass-strong rounded-lg p-4 md:sticky md:top-20 md:self-start">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Admin</p>
                <p className="font-display text-lg mb-6">Control room</p>

                <nav className="flex flex-col gap-4">
                    {groups.map((group) => (
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

            <div className="min-w-0 px-4 py-4 sm:px-0 sm:py-0">
                <Outlet />
            </div>
        </div>
    );
}
