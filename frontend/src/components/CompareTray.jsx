import { useNavigate } from "react-router-dom";
import { useCompare } from "../context/CompareContext";

/**
 * CompareTray - Phase 3 (UI/UX remediation).
 *
 * Fixed floating bar that appears once 2+ products are selected for
 * comparison, showing a thumbnail per item with a remove (x) and a
 * "Compare" button to the full comparison view. Mounted once at the app
 * root (see App.jsx) so it persists across navigation while browsing,
 * the same way a shopping cart mini-bar would.
 */
export default function CompareTray() {
    const compare = useCompare();
    const navigate = useNavigate();

    if (!compare || compare.count < 2) return null;

    return (
        <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-40 glass-strong rounded-lg shadow-lg px-3 py-2.5 flex items-center gap-3 max-w-[95vw] animate-slide-up">
            <div className="flex items-center gap-2 overflow-x-auto">
                {compare.items.map((product) => (
                    <div key={product.id} className="relative shrink-0 w-11 h-11 rounded-md overflow-hidden bg-line/40">
                        {product.image_url && (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        )}
                        <button
                            type="button"
                            onClick={() => compare.remove(product.id)}
                            aria-label={`Remove ${product.name} from comparison`}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-ink text-paper text-[10px] flex items-center justify-center"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={() => navigate("/compare")}
                className="shrink-0 bg-mango text-abyss text-xs font-semibold px-3 py-2 rounded-md hover:bg-mango-dark transition-colors"
            >
                Compare ({compare.count})
            </button>
            <button
                type="button"
                onClick={compare.clear}
                aria-label="Clear comparison"
                className="shrink-0 text-ash hover:text-ink text-xs px-1"
            >
                Clear
            </button>
        </div>
    );
}
