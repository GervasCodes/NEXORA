import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

export default function AdminSellers() {
    const [sellers, setSellers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const load = () => {
        api.get("/admin/sellers").then(({ data }) => setSellers(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleVerified = async (seller) => {
        setBusyId(seller.user_id);
        setError("");
        try {
            await api.put(`/admin/sellers/${seller.user_id}/${seller.is_verified ? "unverify" : "verify"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading sellers…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Sellers</h1>
            {error && <p className="text-coral text-sm mb-4">{error}</p>}

            {sellers.length === 0 && <p className="text-ash text-sm">No stores yet.</p>}

            <ul className="divide-y divide-line border-y border-line">
                {sellers.map((s) => (
                    <li key={s.profile_id} className="py-3 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.store_name}</p>
                            <p className="text-xs text-ash truncate">
                                {s.first_name} {s.last_name} · {s.email}
                            </p>
                            {(s.city || s.region) && (
                                <p className="text-xs text-ash">{[s.city, s.region, s.country].filter(Boolean).join(", ")}</p>
                            )}
                        </div>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.is_verified ? "bg-teal/10 text-teal" : "bg-line text-ash"}`}>
                            {s.is_verified ? "✓ Verified" : "Pending"}
                        </span>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                            {s.is_active ? "Active account" : "Deactivated"}
                        </span>

                        <button
                            onClick={() => toggleVerified(s)}
                            disabled={busyId === s.user_id}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                        >
                            {s.is_verified ? "Remove verification" : "Verify"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
