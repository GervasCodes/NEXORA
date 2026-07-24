import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { formatDate } from "../../utils/format";


export default function AdminDeletedAccounts() {
    const { user: currentUser } = useAuth();
    const isSuperAdmin = currentUser?.admin_level === "super_admin";

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        api.get("/admin/deleted-users")
            .then(({ data }) => setUsers(data.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handlePermanentDelete = async (u) => {
        const typed = window.prompt(
            `This permanently erases ${u.first_name} ${u.last_name}'s personal data, deletes their documents and Cloudinary assets, and can't be undone.\n\n` +
            `Type this account's email address to confirm:\n${u.email}`
        );

        if (typed === null) return;
        if (typed.trim().toLowerCase() !== u.email.toLowerCase()) {
            window.alert("That didn't match the account's email. Nothing was deleted.");
            return;
        }

        setBusyId(u.id);
        setError("");
        try {
            await api.delete(`/admin/deleted-users/${u.id}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading deleted accounts…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Deleted accounts</h1>
            <p className="text-ash text-sm mb-6">
                Accounts that deleted themselves. They can no longer log in and can't be reactivated.
                {isSuperAdmin && " Super admins can permanently erase one below."}
            </p>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}

            {users.length === 0 ? (
                <p className="text-ash text-sm">No deleted accounts.</p>
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {users.map((u) => (
                        <li key={u.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                                <p className="text-xs text-ash truncate">{u.email} · {u.phone}</p>
                            </div>

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
                                    onClick={() => handlePermanentDelete(u)}
                                    disabled={busyId === u.id}
                                    className="text-xs font-medium px-3 py-1.5 rounded-full border border-coral text-coral hover:bg-coral hover:text-white transition disabled:opacity-50"
                                >
                                    {busyId === u.id ? "Deleting…" : "Permanently delete"}
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
