import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";

export default function SellerSetup() {
    const { refreshProfile } = useOutletContext();
    const navigate = useNavigate();
    const [storeTypes, setStoreTypes] = useState([]);
    const [form, setForm] = useState({ store_name: "", store_description: "", store_type_id: "" });
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get("/store-types").then(({ data }) => setStoreTypes(data.data)).catch(() => {});
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await api.post("/seller/profile", form);
            refreshProfile();
            navigate("/seller");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-16">
            <h1 className="font-display text-2xl mb-1">Set up your store</h1>
            <p className="text-ash text-sm mb-8">Give your store a name to start listing products.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">Store name</label>
                    <input required minLength={3} maxLength={150}
                        value={form.store_name}
                        onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Store type</label>
                    <select
                        value={form.store_type_id}
                        onChange={(e) => setForm({ ...form, store_type_id: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-white"
                    >
                        <option value="">Select a store type…</option>
                        {storeTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm mb-1">Store description (optional)</label>
                    <textarea rows={4} maxLength={1000}
                        value={form.store_description}
                        onChange={(e) => setForm({ ...form, store_description: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button type="submit" disabled={submitting}
                    className="w-full bg-mango text-abyss py-2.5 rounded-md font-semibold hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? "Creating store…" : "Create store"}
                </button>
            </form>
        </div>
    );
}
