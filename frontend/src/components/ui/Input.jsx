import { forwardRef, useId, useState } from "react";

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
 *
 * Phase 0 (UI/UX remediation): when `type="password"` is passed, the
 * field grows a show/hide toggle button so every password field in the
 * app gets this for free instead of each page having to build its own.
 * `showPasswordLabel` / `hidePasswordLabel` let a caller pass translated
 * strings (via the app's own t()) without this shared primitive taking a
 * dependency on LanguageContext itself, matching how EmptyState/ErrorState
 * take plain string props rather than reading context directly.
 */
const EyeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M3 3l18 18" strokeLinecap="round" />
        <path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6 0 9.5 7 9.5 7a15.6 15.6 0 0 1-3.1 3.9M6.6 6.6C3.7 8.5 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 3.3-.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.9 10a3 3 0 0 0 4.1 4.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Input = forwardRef(function Input(
    {
        label,
        error,
        hint,
        as = "input",
        className = "",
        id,
        required = false,
        type,
        showPasswordLabel = "Show password",
        hidePasswordLabel = "Hide password",
        ...rest
    },
    ref
) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const Tag = as === "textarea" ? "textarea" : "input";
    const isPassword = as !== "textarea" && type === "password";
    const [revealed, setRevealed] = useState(false);

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1.5">
                    {label}
                    {required && <span className="text-coral ml-0.5">*</span>}
                </label>
            )}
            <div className="relative">
                <Tag
                    id={inputId}
                    ref={ref}
                    type={isPassword ? (revealed ? "text" : "password") : type}
                    aria-invalid={error ? "true" : undefined}
                    aria-required={required || undefined}
                    aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
                    className={[
                        "w-full border rounded-md px-3 py-2 text-base bg-paper text-ink focus-ring transition-colors",
                        isPassword ? "pr-10" : "",
                        error ? "border-coral focus:border-coral" : "border-line focus:border-teal",
                        className
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    {...rest}
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setRevealed((v) => !v)}
                        aria-label={revealed ? hidePasswordLabel : showPasswordLabel}
                        aria-pressed={revealed}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-ash hover:text-ink transition-colors focus-ring rounded-md"
                    >
                        {revealed ? <EyeOffIcon className="w-4.5 h-4.5" /> : <EyeIcon className="w-4.5 h-4.5" />}
                    </button>
                )}
            </div>
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
