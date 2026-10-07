// Previous / next controls for server-paged admin lists. `meta` is the
// `meta` object returned by the paged admin endpoints (page, totalPages, total).
export default function AdminPager({ meta, onChange, disabled, label = "Pages" }) {
    if (!meta || meta.totalPages <= 1) return null;
    return (
        <nav aria-label={label} className="flex items-center justify-between mt-6 text-sm">
            <button
                type="button"
                onClick={() => onChange(meta.page - 1)}
                disabled={disabled || meta.page <= 1}
                className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
            >
                Previous
            </button>
            <span className="text-ash text-xs">
                Page {meta.page} of {meta.totalPages} · {meta.total} total
            </span>
            <button
                type="button"
                onClick={() => onChange(meta.page + 1)}
                disabled={disabled || meta.page >= meta.totalPages}
                className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
            >
                Next
            </button>
        </nav>
    );
}
