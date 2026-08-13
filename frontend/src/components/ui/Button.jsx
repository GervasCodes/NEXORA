import { forwardRef } from "react";

/**
 * Shared Button component - Phase 1 Design System Extraction.
 *
 * Consolidates the primary CTA (`bg-mango text-abyss ...`) and secondary
 * (`border border-line ...`) button patterns that were previously
 * hand-rolled and drifting in padding/font-weight across ~60 call sites.
 *
 * Polymorphic: pass `as={Link}` (react-router-dom) to render a nav CTA as
 * a real link rather than a <button> - required for correct semantics,
 * middle-click/right-click "open in new tab", and SEO on navigation CTAs.
 * Use `to="..."` (or `href`) instead of `onClick` in that case.
 *
 * Variants:
 *  - primary:   warm mango CTA (purchase/submit actions)
 *  - secondary: outlined border-line button (cancel/alt actions)
 *  - ghost:     text-only, no border/background until hover
 *
 * Sizes:
 *  - sm: text-xs, px-3 py-1.5   (dense table/row actions)
 *  - md: text-sm, px-5 py-2.5   (default - forms, page-level actions)
 *  - lg: text-sm, py-2.5 w-full (full-width primary submits)
 */
const VARIANT_CLASSES = {
    primary:
        "bg-mango text-abyss font-medium hover:bg-mango-dark disabled:opacity-60 disabled:cursor-not-allowed",
    secondary:
        "border border-line text-ink font-medium hover:border-ink disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
        "text-ink/70 font-medium hover:text-ink hover:bg-line/30 disabled:opacity-50 disabled:cursor-not-allowed"
};

const SIZE_CLASSES = {
    sm: "text-xs px-3 py-1.5 rounded-md",
    md: "text-sm px-5 py-2.5 rounded-md",
    lg: "text-sm px-5 py-2.5 rounded-md w-full"
};

function cx(...parts) {
    return parts.filter(Boolean).join(" ");
}

const Button = forwardRef(function Button(
    { variant = "primary", size = "md", fullWidth = false, className = "", type = "button", as: Tag = "button", children, ...rest },
    ref
) {
    // When rendered as something other than a native <button> (e.g. React
    // Router's <Link>, for nav CTAs that must stay real links for a11y,
    // right-click/middle-click, and SEO), the `type` attribute doesn't
    // apply and shouldn't be forwarded.
    const typeProp = Tag === "button" ? { type } : {};
    return (
        <Tag
            ref={ref}
            {...typeProp}
            className={cx(
                "inline-flex items-center justify-center transition-colors focus-ring",
                VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
                SIZE_CLASSES[size] || SIZE_CLASSES.md,
                fullWidth && "w-full",
                className
            )}
            {...rest}
        >
            {children}
        </Tag>
    );
});

export default Button;
