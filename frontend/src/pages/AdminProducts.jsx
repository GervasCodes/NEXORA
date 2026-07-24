import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";

export default function AdminProducts() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const load = () => {
        api.get("/admin/products").then(({ data }) => setProducts(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleActive = async (product) => {
        setBusyId(product.id);
        setError("");
        try {
            await api.put(`/admin/products/${product.id}/${product.is_active ? "deactivate" : "activate"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    // Phase 2C "Sponsored products" placement - just the display flag.
    // The campaign/budget system behind it is Phase 8A's job.
    const toggleSponsored = async (product) => {
        setBusyId(product.id);
        setError("");
        try {
            await api.put(`/admin/products/${product.id}/${product.is_sponsored ? "unsponsor" : "sponsor"}`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading products…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Products</h1>
            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <ul className="divide-y divide-line border-y border-line">
                {products.map((p) => (
                    <li key={p.id} className="py-3 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-ash truncate">{p.store_name}</p>
                        </div>

                        <p className="price text-sm">{formatMoney(p.price)}</p>
                        <p className="text-xs text-ash">stock {p.stock}</p>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${p.is_active ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
                            {p.is_active ? "Live" : "Removed"}
                        </span>
                        {p.is_sponsored ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-mango/10 text-mango-dark">
                                Sponsored
                            </span>
                        ) : null}

                        <button
                            onClick={() => toggleSponsored(p)}
                            disabled={busyId === p.id}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                        >
                            {p.is_sponsored ? "Unsponsor" : "Sponsor"}
                        </button>

                        <button
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                        >
                            {p.is_active ? "Remove" : "Restore"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
