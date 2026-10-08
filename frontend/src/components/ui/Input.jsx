import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";

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
 *
 * (Broadcast history - expand instead of scroll): a textarea (`as=
 * "textarea"`) auto-grows to fit its content instead of clipping it
 * behind a native scrollbar once it passes its `rows` height. `rows`
 * still sets the starting size - it's just no longer a hard cap. This
 * lives here rather than per-page because every multi-line field in the
 * app (broadcast compose boxes, reviews, dispute details, ...) already
 * goes through this one component.
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
        onInput,
        ...rest
    },
    ref
) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const Tag = as === "textarea" ? "textarea" : "input";
    const isTextarea = as === "textarea";
    const isPassword = !isTextarea && type === "password";
    const [revealed, setRevealed] = useState(false);
    const textareaRef = useRef(null);

    const resize = useCallback((node) => {
        if (!node) return;
        // Reset first so a shrink (e.g. deleting a line) isn't stuck at
        // the previous, taller scrollHeight.
        node.style.height = "auto";
        node.style.height = `${node.scrollHeight}px`;
    }, []);

    // Covers the controlled-value case (every textarea in the app sets
    // `value` from its own state) - resizes on mount and whenever that
    // value changes, not just on direct user keystrokes, so a value set
    // programmatically (loading a draft, clearing the field after
    // submit) is never left clipped.
    useEffect(() => {
        if (isTextarea) resize(textareaRef.current);
    }, [isTextarea, resize, rest.value]);

    const setTextareaRef = useCallback((node) => {
        textareaRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
    }, [ref]);

    const handleInput = (e) => {
        if (isTextarea) resize(e.target);
        onInput?.(e);
    };

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
                    ref={isTextarea ? setTextareaRef : ref}
                    onInput={handleInput}
                    type={isPassword ? (revealed ? "text" : "password") : type}
                    aria-invalid={error ? "true" : undefined}
                    aria-required={required || undefined}
                    aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
                    className={[
                        "w-full border rounded-md px-3 py-2 text-base bg-paper text-ink focus-ring transition-colors",
                        isTextarea ? "resize-none overflow-hidden" : "",
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
                        {revealed ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
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
