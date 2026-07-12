import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const emptyForm = { first_name: "", last_name: "", email: "", phone: "", password: "", admin_level: "admin" };

export default function AdminManageAdmins() {
    const { user } = useAuth();
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [creating, setCreating] = useState(false);

    const isSuperAdmin = user?.admin_level === "super_admin";

    const load = () => {
        api.get("/admin/admins").then(({ data }) => setAdmins(data.data)).catch((err) => setError(extractErrorMessage(err))).finally(() => setLoading(false));
    };

    useEffect(() => { if (isSuperAdmin) load(); else setLoading(false); }, [isSuperAdmin]);

    if (!isSuperAdmin) {
        return (
            <div className="max-w-lg">
                <h1 className="font-display text-2xl mb-2">Admins</h1>
                <p className="text-ash text-sm">Only super admins can add, remove, or manage other admin accounts.</p>
            </div>
        );
    }

    const handleCreate = async (e) => {
        e.preventDefault();
        setError("");
        setCreating(true);
        try {
            await api.post("/admin/admins", form);
            setForm(emptyForm);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const changeLevel = async (adminId, admin_level) => {
        setBusyId(adminId);
        setError("");
        try {
            await api.put(`/admin/admins/${adminId}/permissions`, { admin_level });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (adminId) => {
        setBusyId(adminId);
        setError("");
        try {
            await api.delete(`/admin/admins/${adminId}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Admins</h1>
            {error && <p className="text-coral text-sm mb-4">{error}</p>}

            <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-3 max-w-xl mb-10 border border-line rounded-lg p-5">
                <h2 className="font-display text-lg sm:col-span-2 mb-1">Add a new admin</h2>

                <input required placeholder="First name" value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input required placeholder="Last name" value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input required type="email" placeholder="Email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input required placeholder="Phone" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input required type="password" minLength={8} placeholder="Temporary password" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <select value={form.admin_level}
                    onChange={(e) => setForm({ ...form, admin_level: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                    <option value="admin">Admin (limited access)</option>
                    <option value="super_admin">Super Admin (full control)</option>
                </select>

                <button type="submit" disabled={creating}
                    className="sm:col-span-2 bg-ink text-paper py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                    {creating ? "Creating…" : "Create admin"}
                </button>
            </form>

            {loading ? <p className="text-ash">Loading admins…</p> : (
                <ul className="divide-y divide-line border-y border-line">
                    {admins.map((a) => (
                        <li key={a.id} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{a.first_name} {a.last_name}</p>
                                <p className="text-xs text-ash truncate">{a.email} · {a.phone}</p>
                            </div>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                a.admin_level === "super_admin" ? "bg-mango/10 text-mango-dark" : "bg-line text-ash"
                            }`}>
                                {a.admin_level === "super_admin" ? "Super Admin" : "Admin"}
                            </span>

                            <button
                                onClick={() => changeLevel(a.id, a.admin_level === "super_admin" ? "admin" : "super_admin")}
                                disabled={busyId === a.id}
                                className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                            >
                                {a.admin_level === "super_admin" ? "Demote to Admin" : "Promote to Super Admin"}
                            </button>

                            <button
                                onClick={() => remove(a.id)}
                                disabled={busyId === a.id || a.id === user.id}
                                className="text-xs border border-coral text-coral px-3 py-1.5 rounded-md hover:bg-coral/10 transition-colors disabled:opacity-50"
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
