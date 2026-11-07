/**
 * Error line for controls the shared <Input> does not wrap (checkboxes, file
 * inputs, a select built by hand). Pair it with aria-invalid and
 * aria-describedby={`${id}-error`} on the control; Input and Select already
 * do this themselves.
 */
export default function FieldError({ id, children }) {
    if (!children) return null;
    return (
        <p id={id ? `${id}-error` : undefined} className="mt-1 text-xs text-coral" role="alert">
            {children}
        </p>
    );
}
