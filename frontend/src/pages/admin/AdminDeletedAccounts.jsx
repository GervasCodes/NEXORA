import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import ActionDialog from "../../components/ActionDialog";
import EmptyState from "../../components/ui/EmptyState";
import useAdminPagedList from "../../hooks/useAdminPagedList";
import AdminListControls from "../../components/admin/AdminListControls";
import AdminPager from "../../components/admin/AdminPager";


export default function AdminDeletedAccounts() {
    const { user: currentUser } = useAuth();
    const isSuperAdmin = currentUser?.admin_level === "super_admin";
    const toast = useToast();

    const [busyId, setBusyId] = useState(null);
    const [dialogUser, setDialogUser] = useState(null);

    const list = useAdminPagedList("/admin/deleted-users", { onError: (m) => toast?.error(m) });
    const { items: users, loading, meta } = list;
    const load = list.reload;

    const handlePermanentDelete = async (u) => {
        setDialogUser(null);
        setBusyId(u.id);
        try {
            const { data } = await api.delete(`/admin/deleted-users/${u.id}`);
            toast?.success(
                data?.data?.hardDeleted
                    ? "Account fully removed — no trace of it remains."
                    : "Account anonymized and permanently disabled. Its order/review/financial history was kept because other users' records depend on it."
            );
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading && !meta) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Deleted Accounts" noIndex />
            <h1 className="font-display text-2xl mb-1">Deleted accounts</h1>
            <p className="text-ash text-sm mb-6">
                Accounts that deleted themselves. They can no longer log in and can't be reactivated.
                {isSuperAdmin && " Super admins can permanently erase one below."}
            </p>

            <AdminListControls
                searchValue={list.searchInput}
                onSearchChange={list.setSearchInput}
                onSubmit={list.submitSearch}
                placeholder="Search name, email or phone"
                ariaLabel="Search deleted accounts"
                filters={[{ key: "status", label: "Filter by status", value: list.filters.status || "", options: [{ value: "", label: "All accounts" },{ value: "pending_review", label: "Awaiting review" },{ value: "removed", label: "Permanently removed" }], onChange: (v) => list.applyFilters({ ...list.filters, status: v }) }]}
            />

            {users.length === 0 ? (
                <EmptyState title="No deleted accounts." />
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {users.map((u) => (
                        <li key={u.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                                <p className="text-xs text-ash truncate">{u.email} · {u.phone}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                                <span className="text-xs px-2 py-1 rounded-full bg-line text-ash capitalize">
                                    {u.role.replace("_", " ")}
                                </span>

                                <p className="text-xs text-ash">Joined {formatDate(u.created_at)}</p>

                                <span className="text-xs font-medium px-2 py-1 rounded-full bg-coral/10 text-coral">
                                    Deleted {formatDate(u.deleted_at)}
                                </span>

                                {u.permanently_deleted_at ? (
                                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-line text-ash">
                                        Permanently removed {formatDate(u.permanently_deleted_at)}
                                    </span>
                                ) : isSuperAdmin ? (
                                    <button
                                        onClick={() => setDialogUser(u)}
                                        disabled={busyId === u.id}
                                        className="w-full sm:w-auto text-xs font-medium px-3 py-1.5 rounded-full border border-coral text-coral hover:bg-coral hover:text-white transition disabled:opacity-50"
                                    >
                                        {busyId === u.id ? "Deleting…" : "Permanently delete"}
                                    </button>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <AdminPager meta={meta} onChange={list.changePage} disabled={loading} label="Deleted account pages" />

            <ActionDialog
                open={!!dialogUser}
                title="Permanently delete this account?"
                description={dialogUser ? `This permanently erases ${dialogUser.first_name} ${dialogUser.last_name}'s personal data, deletes their documents and stored files, and can't be undone.` : ""}
                confirmText={dialogUser?.email}
                confirmTextLabel="Type the account's email address to confirm:"
                confirmLabel="Delete permanently"
                danger
                onConfirm={() => handlePermanentDelete(dialogUser)}
                onCancel={() => setDialogUser(null)}
            />
        </div>
    );
}
