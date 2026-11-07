/**
 * Shared Spinner - the one ring every inline "something is happening"
 * spot uses (buttons, load-more footers, small panels). Replaces the
 * hand-rolled `<span className="… animate-spin">` copies that had drifted
 * across Login, Register, Checkout and Cart.
 *
 * Decorative by default (aria-hidden): pair it with visible text, or pass
 * `label` to render an sr-only announcement inside a role="status".
 *
 * `tone="current"` inherits the surrounding text colour, which is what a
 * button wants (abyss on mango, ink on a secondary button, and so on).
 */
const SIZE = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-6 h-6", lg: "w-9 h-9" };
const TONE = {
    current: "text-current",
    mango: "text-mango",
    abyss: "text-abyss",
    frost: "text-frost",
    ash: "text-ash"
};

export default function Spinner({ size = "sm", tone = "current", label, className = "" }) {
    const ring = (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`${SIZE[size] || SIZE.sm} ${TONE[tone] || TONE.current} animate-spin shrink-0 ${className}`}
            aria-hidden="true"
            focusable="false"
        >
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
        </svg>
    );
    if (!label) return ring;
    return (
        <span role="status" className="inline-flex items-center">
            {ring}
            <span className="sr-only">{label}</span>
        </span>
    );
}
