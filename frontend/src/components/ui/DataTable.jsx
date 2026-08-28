import EmptyState from "./EmptyState";
import { SkeletonList } from "../Skeleton";

/**
 * DataTable — shared list component for admin/seller entity lists
 * (Phase 4 responsive/dead-code remediation).
 *
 * WHY THIS SHAPE, NOT A <table>: every hand-rolled list this replaces
 * (AdminServices, AdminProducts, SellerProducts, and the pattern
 * AdminCategories/AdminStoreTypes/AdminServiceCategories/AdminAuditLogs
 * already followed) was already a "card row" layout (flex-wrap div per
 * item), not an actual <table> — there was no desktop table to add a
 * mobile fallback *to*. Rebuilding these as real <table> elements with a
 * separate mobile card view would mean two rendering paths to keep in
 * sync per page and a much bigger, riskier rewrite for no real gain,
 * since the existing row shape already reflows at small widths via
 * flex-wrap. So DataTable formalizes *that* pattern instead: one row
 * renderer, shared selection/bulk-action chrome, shared pagination,
 * shared loading/empty states — the actual duplicated code across the
 * three "selectable, paginated entity list" pages.
 *
 * USAGE — selectable, paginated list (AdminServices/AdminProducts/SellerProducts shape):
 *
 *   <DataTable
 *     items={products}
 *     loading={loading}
 *     emptyTitle="No products match these filters."
 *     selectable
 *     selectedIds={selectedIds}
 *     onToggleSelectAll={toggleSelectAll}
 *     onToggleSelectOne={toggleSelectOne}
 *     getSelectLabel={(p) => `Select ${p.name}`}
 *     bulkActions={selectedIds.length > 0 && (
 *       <>
 *         <p className="text-xs font-medium">{selectedIds.length} selected</p>
 *         <Button size="sm" variant="secondary" onClick={...}>Restore selected</Button>
 *       </>
 *     )}
 *     renderRow={(p) => (
 *       <>
 *         <div className="w-11 h-11 ...">...</div>
 *         <div className="min-w-0 flex-1">...</div>
 *       </>
 *     )}
 *     pagination={{
 *       page: pagination.page,
 *       totalPages: pagination.totalPages,
 *       total: pagination.total,
 *       itemLabel: "products",
 *       onPageChange: setPage
 *     }}
 *   />
 *
 * For a list that isn't row-per-selectable-entity (e.g. a form + simple
 * toggle list, or an expandable log timeline), use `Pagination` and
 * `EmptyState` directly instead of the whole table — see AdminAuditLogs.jsx.
 *
 * Props:
 *  - items: array of row data (required)
 *  - getRowId: (item) => string|number, defaults to item.id
 *  - loading: bool — shows a SkeletonList instead of rows
 *  - loadingRows: number of skeleton rows while loading (default 5)
 *  - emptyTitle / emptyHint: passed to EmptyState when items is empty
 *  - selectable: bool — renders the checkbox column + "select all" row
 *  - selectedIds: array of currently-selected row ids
 *  - onToggleSelectAll / onToggleSelectOne(id): selection handlers
 *  - selectAllLabel: aria-label for the header checkbox
 *  - getSelectLabel: (item) => aria-label for a row's checkbox
 *  - bulkActions: node rendered in the sticky bar when selection is non-empty
 *  - renderRow: (item) => node — row content after the checkbox
 *  - rowClassName: className applied to each row wrapper
 *  - pagination: { page, totalPages, total, onPageChange, itemLabel }
 */
export default function DataTable({
    items,
    getRowId = (item) => item.id,
    loading = false,
    loadingRows = 5,
    emptyTitle = "Nothing here yet",
    emptyHint,
    selectable = false,
    selectedIds = [],
    onToggleSelectAll,
    onToggleSelectOne,
    selectAllLabel = "Select all on this page",
    getSelectLabel = () => "Select row",
    bulkActions,
    renderRow,
    rowClassName = "py-3 flex flex-wrap items-center gap-3",
    pagination
}) {
    if (loading) return <SkeletonList rows={loadingRows} />;

    if (!items || items.length === 0) {
        return <EmptyState title={emptyTitle} hint={emptyHint} />;
    }

    const allOnPageSelected = selectable && items.length > 0 && items.every((item) => selectedIds.includes(getRowId(item)));

    return (
        <>
            {selectable && bulkActions ? (
                <div className="flex flex-wrap items-center gap-3 border border-line bg-line/20 rounded-lg px-4 py-2.5 mb-4">
                    {bulkActions}
                </div>
            ) : null}

            <div className="border-y border-line divide-y divide-line">
                {selectable && (
                    <div className="py-2 flex items-center gap-3 text-xs text-ash">
                        <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            onChange={onToggleSelectAll}
                            aria-label={selectAllLabel}
                        />
                        Select all on page
                    </div>
                )}

                {items.map((item) => {
                    const id = getRowId(item);
                    return (
                        <div key={id} className={rowClassName}>
                            {selectable && (
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(id)}
                                    onChange={() => onToggleSelectOne(id)}
                                    aria-label={getSelectLabel(item)}
                                />
                            )}
                            {renderRow(item)}
                        </div>
                    );
                })}
            </div>

            {pagination && <Pagination {...pagination} />}
        </>
    );
}

/**
 * Pagination — the "N total · Previous / Page X of Y / Next" footer shared
 * by every paginated admin/seller list. Also usable on its own for list
 * pages that don't fit the DataTable row/selection shape (AdminAuditLogs).
 *
 * Props: page, totalPages, total, onPageChange(nextPage), itemLabel (e.g. "products")
 */
export function Pagination({ page, totalPages, total, onPageChange, itemLabel = "items" }) {
    return (
        <div className="flex items-center justify-between mt-6 text-sm">
            <p className="text-ash text-xs">{total} total {itemLabel}</p>
            <div className="flex items-center gap-3">
                <button
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                >
                    Previous
                </button>
                <span className="text-xs text-ash">Page {page} of {totalPages}</span>
                <button
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
