import { NavLink, Outlet } from "react-router-dom";

const tabs = [
    { to: "/admin", label: "Dashboard", end: true },
    { to: "/admin/dispatch", label: "Dispatch" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/sellers", label: "Sellers" },
    { to: "/admin/account-verifications", label: "Verifications" },
    { to: "/admin/products", label: "Products" },
    { to: "/admin/categories", label: "Categories" },
    { to: "/admin/store-types", label: "Store types" },
    { to: "/admin/orders", label: "Orders" },
    { to: "/admin/withdrawals", label: "Withdrawals" },
    { to: "/admin/disputes", label: "Disputes" },
    { to: "/admin/fraud", label: "Fraud review" },
    { to: "/admin/admins", label: "Admins" },
    { to: "/admin/settings", label: "Settings" }
];

export default function AdminLayout() {
    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-[180px_1fr] gap-8">
            <aside className="glass-strong rounded-lg p-4 md:sticky md:top-20 md:self-start">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Admin</p>
                <p className="font-display text-lg mb-6">Control room</p>

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
                <Outlet />
            </div>
        </div>
    );
}
