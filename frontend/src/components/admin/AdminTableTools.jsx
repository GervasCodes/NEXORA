import { useCallback, useMemo, useState } from "react";

// Shared selection / sorting / bulk-run helpers for admin lists (Phase 8).
// Used by the withdrawals, verifications and disputes screens so the three
// behave the same way: tick rows, sort by a column, run one action across
// the ticked rows and report how many succeeded.

// Selection keyed by row id. `visibleIds` is whatever rows the screen is
// currently showing, so "select all" never ticks rows that are filtered out.
export function useRowSelection() {
    const [selectedIds, setSelectedIds] = useState([]);

    const toggle = useCallback((id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }, []);

    const toggleAll = useCallback((visibleIds) => {
        setSelectedIds((prev) => {
            const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.includes(id));
            if (allSelected) return prev.filter((id) => !visibleIds.includes(id));
            return [...new Set([...prev, ...visibleIds])];
        });
    }, []);

    const clear = useCallback(() => setSelectedIds([]), []);

    return { selectedIds, toggle, toggleAll, clear, setSelectedIds };
}

// Sorting for a list already in memory. `accessors` maps a sort key to a
// function returning the comparable value for a row (numbers, dates as
// timestamps, or strings).
export function useSortedRows(rows, accessors, initial = { key: null, dir: "asc" }) {
    const [sort, setSort] = useState(initial);

    const sorted = useMemo(() => {
        if (!sort.key || !accessors[sort.key]) return rows;
        const get = accessors[sort.key];
        const factor = sort.dir === "asc" ? 1 : -1;
        return [...rows].sort((a, b) => {
            const va = get(a);
            const vb = get(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === "string") return va.localeCompare(vb) * factor;
            return (va - vb) * factor;
        });
    }, [rows, sort, accessors]);

    // Clicking a column: first click sorts ascending, second flips it.
    const toggleSort = useCallback((key) => {
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    }, []);

    return { sorted, sort, toggleSort };
}

// Column header button that shows the current sort direction.
export function SortButton({ label, sortKey, sort, onSort, className = "" }) {
    const active = sort.key === sortKey;
    const arrow = active ? (sort.dir === "asc" ? "↑" : "↓") : "";
    return (
        <button
            type="button"
            onClick={() => onSort(sortKey)}
            aria-label={`Sort by ${label}${active ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                active ? "border-ink text-ink" : "border-line text-ash hover:border-ink"
            } ${className}`}
        >
            {label} {arrow}
        </button>
    );
}

// Runs `action(id)` for each id one after another (not in parallel, so the
// server sees the same order an admin would click through) and tallies
// successes and failures. Failures don't stop the run.
export async function runBulk(ids, action) {
    const result = { ok: 0, failed: [] };
    for (const id of ids) {
        try {
            await action(id);
            result.ok += 1;
        } catch (err) {
            result.failed.push({ id, message: err?.response?.data?.message || err?.message || "Failed" });
        }
    }
    return result;
}

// One-line summary shown after a bulk run.
export function bulkSummary(label, result) {
    if (result.failed.length === 0) return `${label}: ${result.ok} done.`;
    return `${label}: ${result.ok} done, ${result.failed.length} failed (${result.failed[0].message}).`;
}

// Sticky strip shown above a list when rows are ticked.
export function BulkBar({ count, children, onClear }) {
    if (count === 0) return null;
    return (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border border-line bg-paper/95 backdrop-blur rounded-lg px-4 py-2.5 mb-4 shadow-sm">
            <p className="text-xs font-medium">{count} selected</p>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
            <button type="button" onClick={onClear} className="ml-auto text-xs text-ash hover:underline">
                Clear selection
            </button>
        </div>
    );
}
