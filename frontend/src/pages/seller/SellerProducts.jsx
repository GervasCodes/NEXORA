import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatMoney } from "../../utils/format";

export default function SellerProducts() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        api.get("/products/mine/list").then(({ data }) => setProducts(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleActive = async (product) => {
        setBusyId(product.id);
        try {
            await api.put(`/products/${product.id}/${product.is_active ? "deactivate" : "activate"}`);
            load();
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading products…</p>;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-2xl">Your products</h1>
                <Link to="/seller/products/new" className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors">
                    + New product
                </Link>
            </div>

            {products.length === 0 && (
                <p className="text-ash text-sm">You haven't listed any products yet.</p>
            )}

            <ul className="divide-y divide-line border-y border-line">
                {products.map((p) => (
                    <li key={p.id} className="py-4 flex items-center gap-4">
                        <div className="w-14 h-14 bg-line/40 rounded-md overflow-hidden shrink-0">
                            {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="price text-xs text-ash">{formatMoney(p.discount_price || p.price)} · stock {p.stock}</p>
                        </div>

                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${p.is_active ? "bg-teal/10 text-teal" : "bg-line text-ash"}`}>
                            {p.is_active ? "Active" : "Inactive"}
                        </span>

                        <Link to={`/seller/products/${p.id}/edit`} className="text-xs text-teal hover:underline">
                            Edit
                        </Link>

                        <button
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            className="text-xs text-ash hover:text-ink disabled:opacity-50"
                        >
                            {p.is_active ? "Deactivate" : "Activate"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
