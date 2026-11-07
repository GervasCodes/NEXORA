/**
 * Form error pattern (Phase 6) - pure helpers, no React.
 *
 * The pattern every form follows:
 *   1. The <form> has `noValidate`, so the browser's own (English-only,
 *      bubble-style) validation never pre-empts ours.
 *   2. On submit the page runs `validateFields()` and hands the result to
 *      useFormErrors().showErrors().
 *   3. Each field shows its message directly under the input (Input's
 *      `error` prop, or <FieldError/> for controls Input does not cover).
 *      An invalid control carries aria-invalid="true" and
 *      aria-describedby -> the message element.
 *   4. The first invalid control in DOM order is scrolled into view and
 *      focused (see focusFirstInvalid).
 *   5. A field's message clears as soon as the person edits that field.
 *
 * All messages are i18n keys resolved through the caller's t(), so every
 * message exists in both English and Swahili.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

/**
 * A rule is `(value, allValues) => string | { key, params } | null | undefined`.
 * Returning a string means "this i18n key, no params". Null/undefined = valid.
 */
export const rules = {
    required: (key = "form.error.required") => (value) => (isBlank(value) ? key : null),
    requiredChoice: (key = "form.error.selectOption") => (value) => (isBlank(value) ? key : null),
    requiredTrue: (key) => (value) => (value ? null : key),
    email: (key = "form.error.emailInvalid") => (value) => (isBlank(value) || EMAIL_PATTERN.test(String(value).trim()) ? null : key),
    minLength: (min, key = "form.error.minLength") => (value) =>
        (isBlank(value) || String(value).length >= min ? null : { key, params: { min } }),
    matches: (otherField, key) => (value, values) => (value === values?.[otherField] ? null : key),
    custom: (test, key) => (value, values) => (test(value, values) ? null : key)
};

/**
 * Runs `schema` ({ field: [rule, ...] }) against `values` and returns
 * { field: translatedMessage } for the FIRST failing rule of each field.
 * Fields that pass are absent from the result.
 */
export function validateFields(schema, values, t) {
    const errors = {};
    for (const [field, fieldRules] of Object.entries(schema)) {
        for (const rule of fieldRules) {
            const outcome = rule(values?.[field], values);
            if (!outcome) continue;
            errors[field] = typeof outcome === "string" ? t(outcome) : t(outcome.key, outcome.params);
            break;
        }
    }
    return errors;
}

const prefersReducedMotion = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

/**
 * Scrolls to and focuses the first control inside `root` marked
 * aria-invalid="true" (DOM order = visual order, so no field list has to be
 * kept in sync with the markup). Returns the element, or null.
 */
export function focusFirstInvalid(root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    const target = scope?.querySelector?.('[aria-invalid="true"]');
    if (!target) return null;
    target.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    target.focus?.({ preventScroll: true });
    return target;
}
