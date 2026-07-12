# NEXORA - this batch's changes

## 1. Run migrations first
New files: `database/migrations/019_payment_purpose_and_verification.sql`,
`020_otp_codes.sql`, `021_chat_delete_and_clear.sql`.

    cd database && npm run migrate

## 2. Add these env vars on Render (backend service)
Your `backend/.env` already has the placeholders added (BREVO_API_KEY,
BREVO_SENDER_EMAIL, BREVO_SENDER_NAME) - this zip does NOT include your
actual `.env` file since it has your live secrets in it. Just add these
three on Render's dashboard:

    BREVO_API_KEY=<your Brevo v3 API key>
    BREVO_SENDER_EMAIL=<a verified sender in Brevo, e.g. noreply@yourdomain>
    BREVO_SENDER_NAME=NEXORA

Get the API key from Brevo -> Settings -> SMTP & API -> API Keys.
BREVO_SENDER_EMAIL must be a sender you've verified in Brevo (single
sender verification, or a verified domain).

## 3. What changed, file by file
See the chat message for the full breakdown per feature. Every backend
file listed here was require()-graph-checked and syntax-checked; the
frontend was build-tested with `vite build` and passed clean.

## 4. Manual smoke test checklist after deploy
- [ ] Login now asks for an emailed 6-digit code before signing in
- [ ] Settings: switching theme/language/currency applies instantly, no refresh
- [ ] Settings: "Change Password" button emails a code, then reveals the new-password field
- [ ] Seller verification fee: after paying, page shows "waiting for confirmation" instead of instantly showing paid (this is correct now - it only flips once your mobile money provider's webhook fires)
- [ ] Mobile: open the site on a real phone in portrait mode - the hamburger menu should show every nav item, including Sign out
- [ ] Messages: hover/tap your own message to delete it; "Clear chat" button clears your view without affecting the other person's
