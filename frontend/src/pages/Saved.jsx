import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ProductCard from "../components/ProductCard";
import MaintenanceScreen from "../components/MaintenanceScreen";

export default function Saved() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [maintenance, setMaintenance] = useState(null);

    const load = () => {
        setLoading(true);
        setError("");
        setMaintenance(null);
        api.get("/wishlist")
            .then(({ data }) => setItems(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                } else {
                    setError("Couldn't load your saved items.");
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    if (maintenance) {
        return <MaintenanceScreen title="Wishlist is under maintenance" message={maintenance} onRetry={load} />;
    }

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <h1 className="font-display text-2xl mb-1">Saved for later</h1>
            <p className="text-ash text-sm mb-8">Products you've tapped the heart on.</p>

            {loading && <p className="text-ash">Loading…</p>}
            {error && <p className="text-coral">{error}</p>}

            {!loading && !error && items.length === 0 && (
                <div className="text-center py-24">
                    <p className="font-display text-xl mb-1">Nothing saved yet</p>
                    <p className="text-ash text-sm mb-4">Tap the heart icon on any product to save it here.</p>
                    <Link to="/" className="text-teal text-sm hover:underline">Browse products →</Link>
                </div>
            )}

            {!loading && !error && items.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {items.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    );
}
