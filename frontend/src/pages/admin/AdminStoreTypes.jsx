import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

const emptyForm = { name: "" };

export default function AdminStoreTypes() {
    const [storeTypes, setStoreTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const load = () => {
        api.get("/store-types/admin/all").then(({ data }) => setStoreTypes(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const startEdit = (storeType) => {
        setEditingId(storeType.id);
        setForm({ name: storeType.name });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(emptyForm);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            if (editingId) {
                await api.put(`/store-types/${editingId}`, form);
            } else {
                await api.post("/store-types", form);
            }
            setForm(emptyForm);
            setEditingId(null);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const toggleActive = async (storeType) => {
        setBusyId(storeType.id);
        setError("");
        try {
            await api.put(`/store-types/${storeType.id}/${storeType.is_active ? "deactivate" : "activate"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading store types…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-2">Store types</h1>
            <p className="text-sm text-ash mb-6">
                These classify a seller's whole store (e.g. "Phone Store", "Supermarket") -
                different from product categories, which classify individual items.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-start mb-8 border border-line rounded-lg p-4">
                <input
                    required
                    placeholder="Store type name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring flex-1 min-w-[200px]"
                />
                <button type="submit" disabled={submitting}
                    className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-60">
                    {submitting ? "Saving…" : editingId ? "Save changes" : "Add store type"}
                </button>
                {editingId && (
                    <button type="button" onClick={cancelEdit} className="text-sm text-ash hover:text-ink px-2 py-2">
                        Cancel
                    </button>
                )}
            </form>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <ul className="divide-y divide-line border-y border-line">
                {storeTypes.map((t) => (
                    <li key={t.id} className="py-3 flex flex-wrap items-center gap-3">
                        <p className="text-sm font-medium flex-1">{t.name}</p>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${t.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                            {t.is_active ? "Active" : "Hidden"}
                        </span>

                        <button onClick={() => startEdit(t)} className="text-xs text-teal hover:underline">
                            Edit
                        </button>

                        <button
                            onClick={() => toggleActive(t)}
                            disabled={busyId === t.id}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                        >
                            {t.is_active ? "Hide" : "Show"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
