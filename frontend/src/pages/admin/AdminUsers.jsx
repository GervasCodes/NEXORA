import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const load = () => {
        api.get("/admin/users").then(({ data }) => setUsers(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleActive = async (user) => {
        setBusyId(user.id);
        setError("");
        try {
            await api.put(`/admin/users/${user.id}/${user.is_active ? "deactivate" : "activate"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading users…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Users</h1>
            {error && <p className="text-coral text-sm mb-4">{error}</p>}

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

                        <p className="text-xs text-ash">{formatDate(u.created_at)}</p>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                            {u.is_active ? "Active" : "Deactivated"}
                        </span>

                        <button
                            onClick={() => toggleActive(u)}
                            disabled={busyId === u.id}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                        >
                            {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
