/**
 * QuantityStepper - shared tap-friendly quantity control.
 *
 * Mobile UX (item 18): a raw `<input type="number">` relies on the
 * native spinner arrows, which render at a few pixels wide on mobile
 * Safari/Chrome and are effectively unusable at thumb size. This
 * renders two 44px (minimum recommended touch-target size) - / +
 * buttons flanking an editable number field, so quantity can be
 * changed with a tap instead of a precise pinch or the on-screen
 * keyboard.
 *
 * The number field stays directly editable (for anyone who does want
 * to type a quantity), with its native browser spin buttons hidden
 * since the flanking buttons replace them.
 *
 * Props:
 *  - value: number - current quantity
 *  - onChange(nextValue): called with the new, already clamped quantity
 *  - min: number - default 1
 *  - max: number|undefined - omit for no upper bound
 *  - disabled: boolean
 *  - className: string - applied to the outer wrapper, for layout/spacing
 */
export default function QuantityStepper({
    value,
    onChange,
    min = 1,
    max,
    disabled = false,
    className = ""
}) {
    const hasMax = max !== undefined && max !== null;

    const clamp = (n) => {
        let next = Number.isFinite(n) ? n : min;
        next = Math.max(min, next);
        if (hasMax) next = Math.min(max, next);
        return next;
    };

    const decrement = () => onChange(clamp(value - 1));
    const increment = () => onChange(clamp(value + 1));

    const handleInputChange = (e) => {
        const raw = e.target.value;
        if (raw === "") return; // let them clear it while typing; blur re-clamps
        onChange(clamp(Number(raw)));
    };

    const handleBlur = (e) => {
        if (e.target.value === "") onChange(min);
    };

    const atMin = value <= min;
    const atMax = hasMax && value >= max;

    return (
        <div
            className={`inline-flex items-stretch border border-line rounded-md overflow-hidden ${className}`}
        >
            <button
                type="button"
                onClick={decrement}
                disabled={disabled || atMin}
                aria-label="Decrease quantity"
                className="w-11 h-11 flex items-center justify-center shrink-0 text-ink hover:bg-line/40 active:bg-line/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 12h14" />
                </svg>
            </button>
            <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                value={value}
                onChange={handleInputChange}
                onBlur={handleBlur}
                disabled={disabled}
                aria-label="Quantity"
                className="w-12 border-x border-line text-center text-base focus-ring focus:z-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
                type="button"
                onClick={increment}
                disabled={disabled || atMax}
                aria-label="Increase quantity"
                className="w-11 h-11 flex items-center justify-center shrink-0 text-ink hover:bg-line/40 active:bg-line/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
            </button>
        </div>
    );
}
