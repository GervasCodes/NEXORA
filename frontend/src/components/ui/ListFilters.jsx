/**
 * ListFilters - Phase 4 (UI/UX remediation).
 *
 * Shared status/date-range/search filter bar for the buyer's personal
 * history pages (Orders, Bookings, Returns, Disputes) - all four
 * previously fetched their full unfiltered, unpaginated list in one
 * shot with no way to narrow it down. One component so all four pages
 * look and behave identically rather than four hand-rolled filter bars
 * drifting apart over time.
 *
 * Controlled from the parent page (filters state lives there, since
 * each page also needs it to build its API query params) - this is
 * purely the input controls.
 */
export default function ListFilters({ statusOptions, filters, onChange, searchPlaceholder }) {
    const update = (patch) => onChange({ ...filters, ...patch });

    return (
        <div className="flex flex-wrap items-center gap-2 mb-6">
            {statusOptions && (
                <select
                    value={filters.status || ""}
                    onChange={(e) => update({ status: e.target.value || undefined })}
                    className="border border-line rounded-md px-2.5 py-1.5 text-sm bg-paper focus-ring"
                    aria-label="Filter by status"
                >
                    <option value="">All statuses</option>
                    {statusOptions.map((opt) => (
                        <option key={opt} value={opt} className="capitalize">{opt}</option>
                    ))}
                </select>
            )}

            <input
                type="date"
                value={filters.from || ""}
                onChange={(e) => update({ from: e.target.value || undefined })}
                aria-label="From date"
                className="border border-line rounded-md px-2.5 py-1.5 text-sm bg-paper focus-ring"
            />
            <span className="text-ash text-xs">to</span>
            <input
                type="date"
                value={filters.to || ""}
                onChange={(e) => update({ to: e.target.value || undefined })}
                aria-label="To date"
                className="border border-line rounded-md px-2.5 py-1.5 text-sm bg-paper focus-ring"
            />

            <input
                type="search"
                value={filters.q || ""}
                onChange={(e) => update({ q: e.target.value || undefined })}
                placeholder={searchPlaceholder || "Search…"}
                className="flex-1 min-w-[140px] border border-line rounded-md px-2.5 py-1.5 text-sm bg-paper focus-ring"
            />

            {(filters.status || filters.from || filters.to || filters.q) && (
                <button
                    type="button"
                    onClick={() => onChange({})}
                    className="text-xs text-teal hover:underline shrink-0"
                >
                    Clear filters
                </button>
            )}
        </div>
    );
}
