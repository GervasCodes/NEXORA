import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import ActionDialog from "../../components/ActionDialog";
import AdminPager from "../../components/admin/AdminPager";

const PAGE_SIZE = 25;
const ROLE_OPTIONS = [
    { value: "", label: "All roles" },
    { value: "buyer", label: "Buyers" },
    { value: "seller", label: "Sellers" },
    { value: "delivery_agent", label: "Delivery agents" },
    { value: "admin", label: "Admins" }
];

export default function AdminUsers() {
    const { user: currentUser } = useAuth();
    const isSuperAdmin = currentUser?.admin_level === "super_admin";
    const toast = useToast();

    const [users, setUsers] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [filters, setFilters] = useState({ q: "", role: "", status: "" });
    const [page, setPage] = useState(1);
    const [busyId, setBusyId] = useState(null);
    // { kind: "suspend" | "delete", user } while a dialog is open
    const [dialog, setDialog] = useState(null);

    // Server-side paging and search. Reloads the current page and filters
    // after every action so the list stays in step with the database.
    const load = (nextPage = page, nextFilters = filters) => {
        setLoading(true);
        const params = { page: nextPage, pageSize: PAGE_SIZE };
        if (nextFilters.q) params.q = nextFilters.q;
        if (nextFilters.role) params.role = nextFilters.role;
        if (nextFilters.status) params.status = nextFilters.status;
        api.get("/admin/users", { params })
            .then(({ data }) => {
                setUsers(data.data);
                setMeta(data.meta);
            })
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const applyFilters = (next) => {
        setFilters(next);
        setPage(1);
        load(1, next);
    };

    const submitSearch = (e) => {
        e.preventDefault();
        applyFilters({ ...filters, q: searchInput.trim() });
    };

    const changePage = (next) => {
        setPage(next);
        load(next, filters);
    };

    const handleSuspend = async (user, reason) => {
        setDialog(null);
        setBusyId(user.id);
        try {
            await api.put(`/admin/users/${user.id}/suspend`, { reason });
            toast?.success(`${user.first_name} ${user.last_name} has been suspended.`);
            load(page, filters);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleUnsuspend = async (user) => {
        setBusyId(user.id);
        try {
            await api.put(`/admin/users/${user.id}/unsuspend`);
            toast?.success(`${user.first_name} ${user.last_name} has been unsuspended.`);
            load(page, filters);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handlePermanentDelete = async (user) => {
        setDialog(null);
        setBusyId(user.id);
        try {
            const { data } = await api.delete(`/admin/users/${user.id}`);
            toast?.success(
                data?.data?.hardDeleted
                    ? "Account fully removed — no trace of it remains."
                    : "Account anonymized and permanently disabled. Its order/review/financial history was kept because other users' records depend on it."
            );
            load(page, filters);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading && !meta) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Users" noIndex />
            <h1 className="font-display text-2xl mb-6">Users</h1>

            <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
                <form onSubmit={submitSearch} className="flex gap-2 flex-1">
                    <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search name, email, phone or ID"
                        aria-label="Search users"
                        className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm"
                    />
                    <button type="submit" className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink">
                        Search
                    </button>
                </form>
                <select
                    value={filters.role}
                    onChange={(e) => applyFilters({ ...filters, role: e.target.value })}
                    aria-label="Filter by role"
                    className="border border-line rounded-md px-3 py-1.5 text-sm"
                >
                    {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    value={filters.status}
                    onChange={(e) => applyFilters({ ...filters, status: e.target.value })}
                    aria-label="Filter by status"
                    className="border border-line rounded-md px-3 py-1.5 text-sm"
                >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                </select>
            </div>

            {loading && <p className="text-xs text-ash mb-4">Loading…</p>}
            {!loading && users.length === 0 && <p className="text-sm text-ash">No users match these filters.</p>}

            <ul className="divide-y divide-line border-y border-line">
                {users.map((u) => (
                    // Mobile: stacked - identity block, then a metadata row
                    // (badges + date, its own flex-wrap line so it never
                    // interleaves with the name/email), then full-width
                    // action buttons. sm+: back to a single row, same as
                    // before. Reuses the existing Button component; no new
                    // dependency.
                    <li key={u.id} className="py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:hover:bg-line/20 sm:rounded-lg sm:px-2 sm:-mx-2 transition-colors">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                            <p className="text-xs text-ash truncate">{u.email} · {u.phone}</p>
                            {u.suspended_at && (
                                <p className="text-xs text-coral mt-0.5 break-words">
                                    Suspended {formatDate(u.suspended_at)}
                                    {u.suspended_by_name && ` by ${u.suspended_by_name}`}
                                    {u.suspension_reason && ` — "${u.suspension_reason}"`}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0">
                            <span className="text-xs px-2 py-1 rounded-full bg-line text-ash capitalize">
                                {u.role.replace("_", " ")}
                            </span>

                            <p className="text-xs text-ash">{formatDate(u.created_at)}</p>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                                {u.is_active ? "Active" : "Suspended"}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0">
                            <Button
                                onClick={() => (u.is_active ? setDialog({ kind: "suspend", user: u }) : handleUnsuspend(u))}
                                disabled={busyId === u.id}
                                variant="secondary"
                                size="md"
                                className="flex-1 sm:flex-initial min-h-[44px] shadow-sm hover:shadow"
                            >
                                {u.is_active ? "Suspend" : "Unsuspend"}
                            </Button>

                            {isSuperAdmin && (
                                <button
                                    onClick={() => setDialog({ kind: "delete", user: u })}
                                    disabled={busyId === u.id}
                                    className="flex-1 sm:flex-initial min-h-[44px] text-sm font-medium px-4 py-2 rounded-md border border-coral text-coral shadow-sm hover:bg-coral hover:text-white hover:shadow transition-colors disabled:opacity-50"
                                >
                                    {busyId === u.id ? "Deleting…" : "Permanently delete"}
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            <AdminPager meta={meta} onChange={changePage} disabled={loading} label="User pages" />

            <ActionDialog
                open={dialog?.kind === "suspend"}
                title={`Suspend ${dialog?.user?.first_name || ""} ${dialog?.user?.last_name || ""}?`}
                description="The reason is shown to the user and kept on record."
                reasonLabel="Reason for suspension"
                confirmLabel="Suspend account"
                danger
                onConfirm={({ reason }) => handleSuspend(dialog.user, reason)}
                onCancel={() => setDialog(null)}
            />
            <ActionDialog
                open={dialog?.kind === "delete"}
                title="Permanently delete this account?"
                description={dialog?.user ? `This permanently erases ${dialog.user.first_name} ${dialog.user.last_name}'s personal data, deletes their documents and stored files, and can't be undone.` : ""}
                confirmText={dialog?.user?.email}
                confirmTextLabel="Type the account's email address to confirm:"
                confirmLabel="Delete permanently"
                danger
                onConfirm={() => handlePermanentDelete(dialog.user)}
                onCancel={() => setDialog(null)}
            />
        </div>
    );
}
