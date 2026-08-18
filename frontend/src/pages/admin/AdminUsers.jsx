import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";

export default function AdminUsers() {
    const { user: currentUser } = useAuth();
    const isSuperAdmin = currentUser?.admin_level === "super_admin";
    const toast = useToast();

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        api.get("/admin/users").then(({ data }) => setUsers(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const handleSuspend = async (user) => {
        const reason = window.prompt(
            `Why are you suspending ${user.first_name} ${user.last_name}? This is shown to the user and kept on record.`
        );

        if (reason === null) return;
        if (!reason.trim()) {
            toast?.error("A reason is required to suspend an account.");
            return;
        }

        setBusyId(user.id);
        try {
            await api.put(`/admin/users/${user.id}/suspend`, { reason: reason.trim() });
            toast?.success(`${user.first_name} ${user.last_name} has been suspended.`);
            load();
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
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const handlePermanentDelete = async (user) => {
        const typed = window.prompt(
            `This permanently erases ${user.first_name} ${user.last_name}'s personal data, deletes their documents and Cloudinary assets, and can't be undone.\n\n` +
            `Type this account's email address to confirm:\n${user.email}`
        );

        if (typed === null) return;
        if (typed.trim().toLowerCase() !== user.email.toLowerCase()) {
            toast?.error("That didn't match the account's email. Nothing was deleted.");
            return;
        }

        setBusyId(user.id);
        try {
            const { data } = await api.delete(`/admin/users/${user.id}`);
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

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Users" noIndex />
            <h1 className="font-display text-2xl mb-6">Users</h1>

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
                                onClick={() => (u.is_active ? handleSuspend(u) : handleUnsuspend(u))}
                                disabled={busyId === u.id}
                                variant="secondary"
                                size="md"
                                className="flex-1 sm:flex-initial min-h-[44px] shadow-sm hover:shadow"
                            >
                                {u.is_active ? "Suspend" : "Unsuspend"}
                            </Button>

                            {isSuperAdmin && (
                                <button
                                    onClick={() => handlePermanentDelete(u)}
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
        </div>
    );
}
