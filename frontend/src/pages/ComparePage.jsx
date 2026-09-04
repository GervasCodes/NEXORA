import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useCompare } from "../context/CompareContext";
import PageMeta from "../components/PageMeta";
import EmptyState from "../components/ui/EmptyState";

/**
 * ComparePage - Phase 3 (UI/UX remediation).
 *
 * Side-by-side table of whatever's currently in CompareContext (2-3
 * products, client-side only - see that context's own comment on why
 * this never touches the backend). Rows cover the fields every product
 * actually has (price, rating, stock, store, category) rather than a
 * rich per-category spec system the product data model doesn't have.
 */
export default function ComparePage() {
    const compare = useCompare();
    const { format } = useCurrency();

    const items = compare?.items || [];

    if (items.length === 0) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
                <PageMeta title="Compare products" noIndex />
                <EmptyState
                    title="Nothing to compare yet"
                    hint="Tick 'Compare' on a couple of products to see them side by side."
                    action={<Link to="/" className="text-teal hover:underline text-sm">Browse products →</Link>}
                />
            </div>
        );
    }

    const rows = [
        { label: "Price", render: (p) => format(p.discount_price || p.price) },
        { label: "Store", render: (p) => p.store_name || "—" },
        { label: "Rating", render: (p) => p.average_rating ? `★ ${Number(p.average_rating).toFixed(1)} (${p.review_count || 0})` : "No ratings yet" },
        { label: "Stock", render: (p) => Number(p.stock) > 0 ? `${p.stock} available` : "Out of stock" },
        { label: "Region", render: (p) => p.region || "—" }
    ];

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Compare products" noIndex />
            <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-2xl">Compare products</h1>
                <button type="button" onClick={compare.clear} className="text-sm text-coral hover:underline">
                    Clear all
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[500px]">
                    <thead>
                        <tr>
                            <th className="w-32"></th>
                            {items.map((p) => (
                                <th key={p.id} className="text-left align-top pb-4 px-3">
                                    <div className="relative w-full aspect-square bg-line/40 rounded-lg overflow-hidden mb-2">
                                        {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />}
                                        <button
                                            type="button"
                                            onClick={() => compare.remove(p.id)}
                                            aria-label={`Remove ${p.name} from comparison`}
                                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full glass-strong flex items-center justify-center text-xs"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <Link to={`/products/${p.slug}`} className="text-sm font-medium hover:underline line-clamp-2">
                                        {p.name}
                                    </Link>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label} className="border-t border-line">
                                <td className="py-3 pr-3 text-xs font-semibold uppercase tracking-wide text-ash align-top whitespace-nowrap">
                                    {row.label}
                                </td>
                                {items.map((p) => (
                                    <td key={p.id} className="py-3 px-3 text-sm align-top">
                                        {row.render(p)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
