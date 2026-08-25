import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import EmptyState from "../../components/ui/EmptyState";

const EMPTY_FORM = { name: "", address: "", city: "", region: "", contactPhone: "", operatingHours: "" };

export default function AdminPickupPoints() {
    const [points, setPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        setLoading(true);
        api.get("/pickup-points/admin").then(({ data }) => setPoints(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        try {
            await api.post("/pickup-points/admin", form);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const toggleActive = async (point) => {
        setBusyId(point.id);
        try {
            await api.put(`/pickup-points/admin/${point.id}`, { isActive: !point.is_active });
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
            <PageMeta title="Pickup points" noIndex />
            <h1 className="font-display text-2xl mb-1">Pickup points</h1>
            <p className="text-ash text-sm mb-6">Agent/kiosk locations buyers can choose as a delivery destination at checkout.</p>

            <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-8 space-y-3">
                <h2 className="font-display text-lg">Add a pickup point</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                    <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <input placeholder="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>
                <input required placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <div className="grid sm:grid-cols-2 gap-3">
                    <input required placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <input required placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>
                <input placeholder="Operating hours (e.g. Mon-Sat 9am-6pm)" value={form.operatingHours} onChange={(e) => setForm({ ...form, operatingHours: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />

                {error && <p className="text-sm text-coral">{error}</p>}

                <button
                    type="submit"
                    disabled={creating}
                    className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                    {creating ? "Adding…" : "Add pickup point"}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">All pickup points</h2>
            {points.length === 0 ? (
                <EmptyState title="None added yet." />
            ) : (
                <ul className="space-y-2">
                    {points.map((p) => (
                        <li key={p.id} className="border border-line rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{p.name}</p>
                                <p className="text-ash text-xs">{p.address}, {p.city}, {p.region}</p>
                                {p.operating_hours && <p className="text-ash text-xs">{p.operating_hours}</p>}
                            </div>
                            <button
                                disabled={busyId === p.id}
                                onClick={() => toggleActive(p)}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${p.is_active ? "border-teal text-teal" : "border-line text-ash"}`}
                            >
                                {p.is_active ? "Active" : "Inactive"}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
