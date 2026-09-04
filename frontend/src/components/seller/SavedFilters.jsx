import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";

/**
 * SavedFilters - Phase 11 (UI/UX remediation).
 *
 * Lets a seller save their current filter combination under a name and
 * reselect it later. `currentFilters` is whatever shape the calling
 * page's own filter state has (search/category/status for
 * SellerProducts, status/date-range for SellerOrders) - this component
 * doesn't need to know that shape, it just round-trips it as JSON via
 * `onApply`.
 */
export default function SavedFilters({ pageKey, currentFilters, onApply }) {
    const [saved, setSaved] = useState([]);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    const load = () => {
        api.get(`/seller-filters/${pageKey}`).then(({ data }) => setSaved(data.data)).catch(() => {});
    };

    useEffect(load, [pageKey]);

    const hasActiveFilters = Object.values(currentFilters || {}).some((v) => v !== "" && v !== null && v !== undefined);

    const handleSave = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post(`/seller-filters/${pageKey}`, { name, filters: currentFilters });
            setName("");
            setNaming(false);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/seller-filters/${id}`);
            setSaved((prev) => prev.filter((f) => f.id !== id));
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        }
    };

    if (saved.length === 0 && !naming && !hasActiveFilters) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2 mb-3">
            {saved.map((f) => (
                <div key={f.id} className="flex items-center gap-1 border border-line rounded-full pl-3 pr-1 py-1 text-xs">
                    <button type="button" onClick={() => onApply(f.filters)} className="hover:underline">
                        {f.name}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDelete(f.id)}
                        aria-label={`Delete saved filter "${f.name}"`}
                        className="text-ash hover:text-coral w-4 h-4 flex items-center justify-center"
                    >
                        ×
                    </button>
                </div>
            ))}

            {hasActiveFilters && !naming && (
                <button type="button" onClick={() => setNaming(true)} className="text-xs text-teal hover:underline">
                    + Save current filters
                </button>
            )}

            {naming && (
                <form onSubmit={handleSave} className="flex items-center gap-1.5">
                    <input
                        type="text"
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name this view"
                        maxLength={60}
                        className="border border-line rounded-md px-2 py-1 text-xs w-36 focus-ring"
                    />
                    <button type="submit" disabled={busy || !name.trim()} className="text-xs text-teal hover:underline disabled:opacity-50">
                        Save
                    </button>
                    <button type="button" onClick={() => { setNaming(false); setName(""); }} className="text-xs text-ash hover:underline">
                        Cancel
                    </button>
                </form>
            )}
        </div>
    );
}
