// Search box plus optional select filters for server-paged admin lists.
// Pass `filters` as [{ key, label, value, options: [{ value, label }], onChange }].
export default function AdminListControls({ searchValue, onSearchChange, onSubmit, placeholder, ariaLabel, filters = [] }) {
    return (
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
            <form onSubmit={onSubmit} className="flex gap-2 flex-1">
                <input
                    type="search"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm"
                />
                <button type="submit" className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink">
                    Search
                </button>
            </form>
            {filters.map((f) => (
                <select
                    key={f.key}
                    value={f.value}
                    onChange={(e) => f.onChange(e.target.value)}
                    aria-label={f.label}
                    className="border border-line rounded-md px-3 py-1.5 text-sm"
                >
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            ))}
        </div>
    );
}
