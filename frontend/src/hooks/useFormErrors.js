import { useCallback, useEffect, useRef, useState } from "react";
import { focusFirstInvalid } from "../utils/formErrors";

/**
 * Per-field form errors (Phase 6). See utils/formErrors.js for the pattern.
 *
 *   const { formRef, errors, showErrors, clearError, clearErrors } = useFormErrors();
 *   <form ref={formRef} noValidate onSubmit={...}>
 *   <Input error={errors.email} onChange={(e) => { clearError("email"); ... }} />
 *
 * showErrors(next) replaces the error map and, when it has entries, moves
 * focus to the first invalid control once React has rendered aria-invalid.
 */
export default function useFormErrors() {
    const formRef = useRef(null);
    const [errors, setErrors] = useState({});
    const [focusTick, setFocusTick] = useState(0);

    const showErrors = useCallback((next) => {
        setErrors(next || {});
        if (next && Object.keys(next).length > 0) setFocusTick((n) => n + 1);
    }, []);

    const clearError = useCallback((field) => {
        setErrors((prev) => {
            if (!(field in prev)) return prev;
            const rest = { ...prev };
            delete rest[field];
            return rest;
        });
    }, []);

    const clearErrors = useCallback(() => setErrors((prev) => (Object.keys(prev).length ? {} : prev)), []);

    useEffect(() => {
        if (focusTick > 0) focusFirstInvalid(formRef.current);
    }, [focusTick]);

    return { formRef, errors, showErrors, clearError, clearErrors, hasErrors: Object.keys(errors).length > 0 };
}
