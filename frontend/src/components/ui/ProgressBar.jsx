/**
 * Shared ProgressBar.
 *
 *  - `value` 0-100  -> determinate fill (uploads, multi-step flows)
 *  - `value` omitted -> indeterminate sliding segment (unknown duration)
 *
 * Always exposes role="progressbar"; aria-valuenow is left off when
 * indeterminate, as the ARIA spec asks.
 */
const HEIGHT = { xs: "h-1", sm: "h-1.5", md: "h-2.5" };
const TONE = { mango: "bg-mango", teal: "bg-teal", azure: "bg-azure", coral: "bg-coral", ink: "bg-ink" };

export default function ProgressBar({ value, label, size = "sm", tone = "mango", showValue = false, hideLabel = false, className = "" }) {
    const determinate = typeof value === "number" && Number.isFinite(value);
    const pct = determinate ? Math.max(0, Math.min(100, Math.round(value))) : undefined;
    const fill = TONE[tone] || TONE.mango;
    return (
        <div className={className}>
            {((label && !hideLabel) || (showValue && determinate)) && (
                <div className="flex items-center justify-between text-xs text-ash mb-1">
                    <span>{hideLabel ? "" : label}</span>
                    {showValue && determinate && <span aria-hidden="true">{pct}%</span>}
                </div>
            )}
            <div
                role="progressbar"
                aria-label={label || undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className={`relative w-full overflow-hidden rounded-full bg-line ${HEIGHT[size] || HEIGHT.sm}`}
            >
                {determinate ? (
                    <div className={`h-full rounded-full ${fill} transition-[width] duration-200 ease-out`} style={{ width: `${pct}%` }} />
                ) : (
                    <div className={`absolute inset-y-0 left-0 w-1/3 rounded-full ${fill} animate-indeterminate`} />
                )}
            </div>
        </div>
    );
}
