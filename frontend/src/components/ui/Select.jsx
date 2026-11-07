import { forwardRef, useId } from "react";
import FieldError from "./FieldError";

/**
 * <select> with the same label / hint / error contract as Input (Phase 6):
 * red border, message under the control, aria-invalid and aria-describedby.
 */
const Select = forwardRef(function Select(
    { label, error, hint, className = "", id, required = false, children, ...rest },
    ref
) {
    const generatedId = useId();
    const selectId = id || generatedId;

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="block text-sm font-medium text-ink mb-1.5">
                    {label}
                    {required && <span className="text-coral ml-0.5">*</span>}
                </label>
            )}
            <select
                id={selectId}
                ref={ref}
                aria-invalid={error ? "true" : undefined}
                aria-required={required || undefined}
                aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
                className={[
                    "w-full border rounded-md px-3 py-2 text-base bg-paper text-ink focus-ring transition-colors",
                    error ? "border-coral focus:border-coral" : "border-line focus:border-teal",
                    className
                ].filter(Boolean).join(" ")}
                {...rest}
            >
                {children}
            </select>
            {error ? (
                <FieldError id={selectId}>{error}</FieldError>
            ) : hint ? (
                <p id={`${selectId}-hint`} className="mt-1 text-xs text-ash">{hint}</p>
            ) : null}
        </div>
    );
});

export default Select;
