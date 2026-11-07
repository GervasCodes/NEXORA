# Phase 6 - Form error states (Workstream B)

Frontend only. Unzip over the repository root (paths start with NEXORA/).

## The pattern (one reusable implementation)
- `frontend/src/utils/formErrors.js` - pure helpers: `rules` (required, email, minLength, matches, requiredTrue, custom),
  `validateFields(schema, values, t)` and `focusFirstInvalid(root)`.
- `frontend/src/hooks/useFormErrors.js` - `{ formRef, errors, showErrors, clearError, clearErrors, hasErrors }`.
  `showErrors()` stores the map and, after render, scrolls to and focuses the first `aria-invalid="true"` control
  (DOM order, so no field list to keep in sync). `prefers-reduced-motion` is respected.
- Controls: existing `Input` (`error` prop, unchanged), NEW `ui/Select.jsx` (same label/hint/error contract),
  NEW `ui/FieldError.jsx` (for checkboxes / file inputs), and `PhoneInput` gained an optional `error` prop.
  Every invalid control gets `aria-invalid` and `aria-describedby` pointing at its message (`role="alert"`).
- Forms use `noValidate` so the browser's English-only bubbles never pre-empt the en/sw messages.
- A message clears as soon as its field is edited. A short "fix the highlighted fields" line shows by the submit button.

## Files added (7)
- frontend/src/utils/formErrors.js
- frontend/src/hooks/useFormErrors.js
- frontend/src/components/ui/Select.jsx
- frontend/src/components/ui/FieldError.jsx
- frontend/tests/utils/formErrors.test.js
- frontend/tests/components/ui/FormErrorControls.test.jsx
- frontend/tests/pages/NewReturn.test.jsx (no test existed for this page before)

## Files modified (14)
- frontend/src/pages/Login.jsx, Register.jsx (account + documents steps), Checkout.jsx, NewDispute.jsx, NewReturn.jsx
- frontend/src/components/PhoneInput.jsx (optional `error`), UsernameField.jsx (optional `error`, live status still wins)
- frontend/src/components/ui/index.js (exports Select, FieldError)
- frontend/src/i18n/en.js, sw.js (17 keys each: `form.error.*`, `checkout.error.*`, `dispute.error.*`, `return.error.*`, `auth.error.*`)
- frontend/tests/pages/Login.test.jsx, Register.test.jsx, Checkout.test.jsx, NewDispute.test.jsx

## Files deleted
None.

## New env vars / migrations / dependencies
None.

## Behaviour changes to be aware of
- Submit buttons are no longer disabled for "terms not ticked", "invalid phone" (Checkout) or "passwords differ"
  (Register). A disabled button cannot explain itself; the click now shows the message and focuses the field.
  Checkout and Register tests that asserted the disabled state were updated.
- Checkout: the old toasts for invalid phone and missing Terms are now inline messages (Terms text is now translated; it was
  hard-coded English). An empty phone is now an inline error (previously only the browser's `required` bubble).
- Checkout validates only fields that are on screen (a chosen saved address or a pickup point has no address inputs).
- Register: phone input now has `id="register-phone"` with a linked label; file inputs have ids/labels.
- NewDispute / NewReturn: fields now use the shared Input/Select (same look as other forms; labels unchanged, no asterisks).
- Not changed: the OTP step, GoogleCompleteProfile and every other form in the app (the pattern is ready to roll out).

## How to test
    cd frontend
    npx vitest run tests/utils/formErrors.test.js tests/components/ui/FormErrorControls.test.jsx \
        tests/pages/Login.test.jsx tests/pages/Register.test.jsx tests/pages/RegisterUploadProgress.test.jsx \
        tests/pages/Checkout.test.jsx tests/pages/NewDispute.test.jsx tests/pages/NewReturn.test.jsx
    npx vitest run                      # full suite
    npx eslint src tests
    npx vite build

Manual (try in English and Kiswahili): on each of Login, Register (both steps for a seller / delivery agent), Checkout
(home delivery and pickup), New dispute, New return: press submit with the form empty -> a message under every
required field, focus lands on the first one, the page scrolls to it on a 360px-wide phone; fix one field -> only
its message disappears; screen reader announces the message when the field is focused.
Also confirm the e2e visual baseline `checkout-filled.png` is unchanged (filled state should look identical).
