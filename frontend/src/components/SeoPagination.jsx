import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

// Plain-link page numbers for listings whose first page is the clean URL
// and later pages are `?page=N`. The grids above this still scroll
// infinitely for shoppers; these anchors are what lets a crawler (and a
// shopper who shares a link) reach and land on any page directly.
// Renders nothing for a single page.
export default function SeoPagination({ page, totalPages }) {
    const { t } = useLanguage();
    const { pathname } = useLocation();
    if (!totalPages || totalPages <= 1) return null;

    const hrefFor = (n) => (n <= 1 ? pathname : `${pathname}?page=${n}`);

    // Window of up to 7 numbers around the current page, first/last always shown.
    const numbers = new Set([1, totalPages, page - 1, page, page + 1, page + 2]);
    const list = [...numbers].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

    return (
        <nav aria-label={t("seo.pagination")} className="mt-10 flex flex-wrap items-center justify-center gap-1.5 text-sm">
            {page > 1 && (
                <Link to={hrefFor(page - 1)} rel="prev" className="px-3 py-2 rounded-md border border-line hover:border-ink">
                    {t("seo.pagePrevious")}
                </Link>
            )}
            {list.map((n, i) => (
                <span key={n} className="flex items-center gap-1.5">
                    {i > 0 && n - list[i - 1] > 1 && <span aria-hidden="true" className="text-ash">…</span>}
                    {n === page ? (
                        <span aria-current="page" className="px-3 py-2 rounded-md bg-ink text-paper">{n}</span>
                    ) : (
                        <Link to={hrefFor(n)} className="px-3 py-2 rounded-md border border-line hover:border-ink">{n}</Link>
                    )}
                </span>
            ))}
            {page < totalPages && (
                <Link to={hrefFor(page + 1)} rel="next" className="px-3 py-2 rounded-md border border-line hover:border-ink">
                    {t("seo.pageNext")}
                </Link>
            )}
        </nav>
    );
}
