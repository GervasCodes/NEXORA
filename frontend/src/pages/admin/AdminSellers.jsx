import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageLoader from "../../components/PageLoader";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";

export default function AdminSellers() {
    const [sellers, setSellers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const toast = useToast();

    const load = () => {
        api.get("/admin/sellers").then(({ data }) => setSellers(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleVerified = async (seller) => {
        setBusyId(seller.user_id);
        try {
            await api.put(`/admin/sellers/${seller.user_id}/${seller.is_verified ? "unverify" : "verify"}`);
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
            <PageMeta title="Sellers" noIndex />
            <h1 className="font-display text-2xl mb-6">Sellers</h1>

            {sellers.length === 0 && <EmptyState title="No stores yet." />}

            <ul className="divide-y divide-line border-y border-line">
                {sellers.map((s) => (
                    <li key={s.profile_id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.store_name}</p>
                            <p className="text-xs text-ash truncate">
                                {s.first_name} {s.last_name} · {s.email}
                            </p>
                            {(s.city || s.region) && (
                                <p className="text-xs text-ash">{[s.city, s.region, s.country].filter(Boolean).join(", ")}</p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.is_verified ? "bg-teal/10 text-teal" : "bg-line text-ash"}`}>
                                {s.is_verified ? "✓ Verified" : "Pending"}
                            </span>

                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                                {s.is_active ? "Active account" : "Deactivated"}
                            </span>

                            <Button
                                onClick={() => toggleVerified(s)}
                                disabled={busyId === s.user_id}
                                variant="secondary"
                                size="sm"
                                className="w-full sm:w-auto"
                            >
                                {s.is_verified ? "Remove verification" : "Verify"}
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
