import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";

export default function AdminEfd() {
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const load = () => {
        setLoading(true);
        api.get("/efd/admin/pending").then(({ data }) => setPending(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const decide = async (userId, approved) => {
        setBusyId(userId);
        setError("");
        try {
            await api.put(`/efd/admin/${userId}/verify`, { approved });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="EFD registrations" noIndex />
            <h1 className="font-display text-2xl mb-1">EFD tax registrations</h1>
            <p className="text-ash text-sm mb-6">Sellers awaiting verification before fiscal receipts are issued for their orders.</p>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}

            {pending.length === 0 ? (
                <p className="text-ash text-sm">Nothing pending.</p>
            ) : (
                <ul className="space-y-3">
                    {pending.map((s) => (
                        <li key={s.user_id} className="border border-line rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{s.store_name}</p>
                                <p className="text-ash text-xs">{s.email}</p>
                                <p className="text-ash text-xs mt-1">TIN: {s.tin}{s.vrn ? ` · VRN: ${s.vrn}` : ""}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={busyId === s.user_id}
                                    onClick={() => decide(s.user_id, true)}
                                    className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                                >
                                    Approve
                                </button>
                                <button
                                    disabled={busyId === s.user_id}
                                    onClick={() => decide(s.user_id, false)}
                                    className="border border-line px-4 py-2 rounded-md text-sm hover:border-coral hover:text-coral transition-colors disabled:opacity-60"
                                >
                                    Reject
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
