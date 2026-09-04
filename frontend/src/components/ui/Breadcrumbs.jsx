import { Link } from "react-router-dom";

/**
 * Shared Breadcrumbs component - Phase 0 (UI/UX remediation).
 *
 * There was previously no breadcrumb trail anywhere in the app, which
 * matters most on deep hierarchies like
 * Home -> Department -> Category -> Product, where the mobile back
 * button is otherwise the only way to move up a level.
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     { label: "Home", href: "/" },
 *     { label: "Electronics", href: "/department/electronics" },
 *     { label: "Phones" } // current page - last item, no href
 *   ]} />
 *
 * The last item is always rendered as the current page (non-clickable,
 * aria-current="page") regardless of whether it has an href - so callers
 * can pass the full trail including the current page without special-
 * casing it themselves.
 *
 * This phase only builds the component; wiring it into ProductDetail,
 * DepartmentPage, ServiceDetail, StorePage, GuideDetail, etc. happens in
 * later phases.
 */
export default function Breadcrumbs({ items = [] }) {
    if (!items.length) return null;

    return (
        <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ash">
                {items.map((item, i) => {
                    const isLast = i === items.length - 1;
                    return (
                        <li key={`${item.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                            {i > 0 && (
                                <span aria-hidden="true" className="text-line shrink-0">
                                    /
                                </span>
                            )}
                            {isLast || !item.href ? (
                                <span
                                    aria-current={isLast ? "page" : undefined}
                                    className={`truncate ${isLast ? "text-ink font-medium" : ""}`}
                                >
                                    {item.label}
                                </span>
                            ) : (
                                <Link
                                    to={item.href}
                                    className="truncate hover:text-teal hover:underline transition-colors"
                                >
                                    {item.label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
