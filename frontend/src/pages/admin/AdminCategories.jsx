import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

const emptyForm = { name: "", description: "", display_order: 0 };

export default function AdminCategories() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [uploadingCoverId, setUploadingCoverId] = useState(null);
    const [error, setError] = useState("");
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const load = () => {
        api.get("/categories/admin/all").then(({ data }) => setCategories(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const startEdit = (category) => {
        setEditingId(category.id);
        setForm({
            name: category.name,
            description: category.description || "",
            display_order: category.display_order || 0
        });
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
                await api.put(`/categories/${editingId}`, form);
            } else {
                await api.post("/categories", form);
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

    const toggleActive = async (category) => {
        setBusyId(category.id);
        setError("");
        try {
            await api.put(`/categories/${category.id}/${category.is_active ? "deactivate" : "activate"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    // Department cover image - shown on the new homepage department cards.
    // Optional: cards fall back to a generated placeholder when unset.
    const handleCoverUpload = async (category, e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingCoverId(category.id);
        setError("");
        try {
            const body = new FormData();
            body.append("cover", file);
            await api.post(`/categories/${category.id}/cover`, body);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setUploadingCoverId(null);
            e.target.value = "";
        }
    };

    if (loading) return <p className="text-ash">Loading categories…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Categories</h1>

            <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-start mb-8 border border-line rounded-lg p-4">
                <input
                    required
                    placeholder="Category name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring flex-1 min-w-[160px]"
                />
                <input
                    placeholder="Description (optional)"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring flex-1 min-w-[200px]"
                />
                <input
                    type="number"
                    min="0"
                    title="Homepage display order (lower shows first)"
                    placeholder="Order"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                    className="border border-line rounded-md px-3 py-2 text-sm focus-ring w-20"
                />
                <button type="submit" disabled={submitting}
                    className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors disabled:opacity-60">
                    {submitting ? "Saving…" : editingId ? "Save changes" : "Add category"}
                </button>
                {editingId && (
                    <button type="button" onClick={cancelEdit} className="text-sm text-ash hover:text-ink px-2 py-2">
                        Cancel
                    </button>
                )}
            </form>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <ul className="divide-y divide-line border-y border-line">
                {categories.map((c) => (
                    <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                        <div className="w-12 h-12 rounded-md bg-line/40 overflow-hidden shrink-0">
                            {c.cover_image_url ? (
                                <img src={c.cover_image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{c.name}</p>
                            {c.description && <p className="text-xs text-ash truncate">{c.description}</p>}
                        </div>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${c.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                            {c.is_active ? "Active" : "Hidden"}
                        </span>

                        <label className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors cursor-pointer">
                            {uploadingCoverId === c.id ? "Uploading…" : c.cover_image_url ? "Change cover" : "Add cover"}
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingCoverId === c.id}
                                onChange={(e) => handleCoverUpload(c, e)}
                            />
                        </label>

                        <button onClick={() => startEdit(c)} className="text-xs text-teal hover:underline">
                            Edit
                        </button>

                        <button
                            onClick={() => toggleActive(c)}
                            disabled={busyId === c.id}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                        >
                            {c.is_active ? "Hide" : "Show"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
