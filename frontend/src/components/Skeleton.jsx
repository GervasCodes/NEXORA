
export default function Skeleton({ className = "", ...rest }) {
    return <div className={`skeleton animate-shimmer rounded-md ${className}`} {...rest} />;
}


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

// Phase 8 sub-phase 3 (empty & loading states, Messages.jsx): a variant of
// SkeletonRow/SkeletonList for rows built around a circular avatar - a
// person's name + last-message preview - rather than SkeletonRow's square
// product-image shape, so the conversation list's loading state actually
// resembles conversation rows instead of borrowing the product-grid shape.
export function SkeletonAvatarRow({ delayClass = "" }) {
    return (
        <li className={`py-4 flex items-center gap-4 animate-fade-in ${delayClass}`}>
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
            </div>
        </li>
    );
}

export function SkeletonAvatarList({ rows = 4 }) {
    const delays = ["", "stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5"];
    return (
        <ul className="divide-y divide-line border-y border-line">
            {Array.from({ length: rows }).map((_, i) => (
                <SkeletonAvatarRow key={i} delayClass={delays[i] || "stagger-6"} />
            ))}
        </ul>
    );
}
