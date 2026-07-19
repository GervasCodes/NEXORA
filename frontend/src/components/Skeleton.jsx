// Reusable shimmering placeholder shown while data loads, instead of a
// bare "Loading…" string. Cheap: the shimmer is a pure CSS background-
// position animation (see .skeleton in index.css), so rendering a dozen
// of these has no measurable perf cost, even on low-end mobile.
export default function Skeleton({ className = "", ...rest }) {
    return <div className={`skeleton animate-shimmer rounded-md ${className}`} {...rest} />;
}

// A row shaped like a cart/order line item: thumbnail + two text lines +
// a trailing price. Used by Cart.jsx / Orders.jsx loading states so the
// skeleton actually resembles the content it's about to be replaced by,
// which reduces layout shift and feels faster than a spinner.
export function SkeletonRow({ delayClass = "" }) {
    return (
        <li className={`py-5 flex gap-4 items-center animate-fade-in ${delayClass}`}>
            <Skeleton className="w-20 h-20 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-14 shrink-0" />
        </li>
    );
}

export function SkeletonList({ rows = 4 }) {
    const delays = ["", "stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5"];
    return (
        <ul className="divide-y divide-line border-y border-line">
            {Array.from({ length: rows }).map((_, i) => (
                <SkeletonRow key={i} delayClass={delays[i] || "stagger-6"} />
            ))}
        </ul>
    );
}
