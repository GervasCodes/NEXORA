import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatMoney } from "../../utils/format";
import EmptyState from "../../components/ui/EmptyState";

const STATUS_STYLES = {
    open: "bg-mango/20 text-mango-dark",
    successful: "bg-teal text-white",
    failed: "bg-coral/10 text-coral",
    cancelled: "bg-line text-ash"
};

export default function SellerGroupBuys() {
    const [products, setProducts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ productId: "", groupPrice: "", minParticipants: 5, deadline: "" });
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");

    const load = () => {
        Promise.all([
            api.get("/products/mine/list").then(({ data }) => data.data).catch(() => []),
            api.get("/group-buys/seller/mine").then(({ data }) => data.data)
        ]).then(([productsData, groupsData]) => {
            setProducts(productsData);
            setGroups(groupsData);
        }).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        try {
            await api.post("/group-buys/seller", {
                productId: Number(form.productId),
                groupPrice: Number(form.groupPrice),
                minParticipants: Number(form.minParticipants),
                deadline: new Date(form.deadline).toISOString()
            });
            setForm({ productId: "", groupPrice: "", minParticipants: 5, deadline: "" });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Group buys" noIndex />
            <h1 className="font-display text-2xl mb-1">Group buys</h1>
            <p className="text-ash text-sm mb-6">Offer a discounted price that only kicks in once enough buyers join.</p>

            <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-8 space-y-3">
                <h2 className="font-display text-lg">Start a group buy</h2>
                <select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                    <option value="" disabled>Choose a product</option>
                    {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.price)}</option>
                    ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                    <input required type="number" min="1" step="0.01" placeholder="Group price" value={form.groupPrice} onChange={(e) => setForm({ ...form, groupPrice: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <input required type="number" min="2" placeholder="Min participants" value={form.minParticipants} onChange={(e) => setForm({ ...form, minParticipants: e.target.value })} className="border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>
                <input required type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />

                {error && <p className="text-sm text-coral">{error}</p>}

                <button type="submit" disabled={creating} className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {creating ? "Creating…" : "Start group buy"}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">Your group buys</h2>
            {groups.length === 0 ? (
                <EmptyState title="None yet." />
            ) : (
                <ul className="space-y-2">
                    {groups.map((g) => (
                        <li key={g.id} className="border border-line rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{g.product_name}</p>
                                <p className="text-ash text-xs">{g.participant_count}/{g.min_participants} joined · {formatMoney(g.group_price)}</p>
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[g.status] || "bg-line text-ash"}`}>
                                {g.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
