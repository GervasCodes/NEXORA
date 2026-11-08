import useT from "./ui/useT";


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


// ---------------------------------------------------------------------------
// Loader rollout: page-shaped skeletons. Each is wrapped in role="status"
// with an sr-only label (the shimmer blocks themselves are aria-hidden), so
// assistive tech hears one polite "Loading ..." instead of silence.
// ---------------------------------------------------------------------------
function Shell({ label, className = "", children }) {
    const t = useT();
    return (
        <div role="status" className={`animate-fade-in ${className}`}>
            <span className="sr-only">{label || t("common.loading")}</span>
            <div aria-hidden="true">{children}</div>
        </div>
    );
}

export function SkeletonText({ lines = 3, className = "" }) {
    return (
        <div className={`space-y-2 ${className}`} aria-hidden="true">
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
            ))}
        </div>
    );
}

export function SkeletonCard({ className = "" }) {
    return (
        <div className={`border border-line rounded-md p-4 space-y-3 ${className}`} aria-hidden="true">
            <Skeleton className="h-4 w-1/2" />
            <SkeletonText lines={2} />
        </div>
    );
}

export function SkeletonStat({ count = 4 }) {
    return (
        <Shell className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="border border-line rounded-md p-4 space-y-3">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-7 w-2/3" />
                </div>
            ))}
        </Shell>
    );
}

export function SkeletonTable({ rows = 6, cols = 5, label }) {
    return (
        <Shell label={label} className="border border-line rounded-md overflow-hidden">
            <div className="flex gap-4 px-4 py-3 border-b border-line bg-line/20">
                {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 flex-1" />)}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex gap-4 px-4 py-4 border-b border-line last:border-b-0">
                    {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className={`h-3.5 flex-1 ${c === 0 ? "max-w-[30%]" : ""}`} />)}
                </div>
            ))}
        </Shell>
    );
}

export function SkeletonDetail({ label }) {
    return (
        <Shell label={label} className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-2 gap-8">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <div className="space-y-4">
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-5 w-1/4" />
                <SkeletonText lines={4} />
                <Skeleton className="h-11 w-full rounded-md" />
            </div>
        </Shell>
    );
}

export function SkeletonProfile({ label }) {
    return (
        <Shell label={label} className="max-w-2xl mx-auto px-4 py-10 space-y-6">
            <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <SkeletonCard />
            <SkeletonCard />
        </Shell>
    );
}

// Store page: banner, avatar + name, then a product grid.
export function SkeletonStore({ label }) {
    return (
        <Shell label={label} className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <Skeleton className="h-40 sm:h-56 w-full rounded-lg" />
            <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="aspect-square w-full rounded-md" />
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                    </div>
                ))}
            </div>
        </Shell>
    );
}

// Generic page: heading plus a list of rows. Drop-in replacement for a bare
// <PageLoader /> on list pages.
export function SkeletonPage({ rows = 4, label, avatar = false }) {
    return (
        <Shell label={label} className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
            <Skeleton className="h-7 w-1/3" />
            {avatar ? <SkeletonAvatarList rows={rows} /> : <SkeletonList rows={rows} />}
        </Shell>
    );
}
