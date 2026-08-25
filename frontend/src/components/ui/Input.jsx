import { forwardRef, useId } from "react";

/**
 * Shared Input / TextField component - Phase 1 Design System Extraction.
 *
 * Consolidates the ~150 duplicated `border border-line rounded-md px-3
 * py-2 text-sm ...` input classNames scattered across forms. Always
 * applies `focus-ring` - this was missing on 23 existing fields, which is
 * the accessibility bug this component structurally prevents from
 * recurring.
 *
 * Renders a <textarea> when `as="textarea"` is passed, otherwise an
 * <input>. Label and error text are optional - pass only `props` to get
 * a bare styled input for tight inline layouts.
 */
const Input = forwardRef(function Input(
    { label, error, hint, as = "input", className = "", id, required = false, ...rest },
    ref
) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const Tag = as === "textarea" ? "textarea" : "input";

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1.5">
                    {label}
                    {required && <span className="text-coral ml-0.5">*</span>}
                </label>
            )}
            <Tag
                id={inputId}
                ref={ref}
                aria-invalid={error ? "true" : undefined}
                aria-required={required || undefined}
                aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
                className={[
                    "w-full border rounded-md px-3 py-2 text-sm bg-paper text-ink focus-ring transition-colors",
                    error ? "border-coral focus:border-coral" : "border-line focus:border-teal",
                    className
                ]
                    .filter(Boolean)
                    .join(" ")}
                {...rest}
            />
            {error ? (
                <p id={`${inputId}-error`} className="mt-1 text-xs text-coral" role="alert">
                    {error}
                </p>
            ) : hint ? (
                <p id={`${inputId}-hint`} className="mt-1 text-xs text-ash">
                    {hint}
                </p>
            ) : null}
        </div>
    );
});

export default Input;
