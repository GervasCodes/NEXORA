// Brevo SMTP transactional email helper. See backend/.env.example for the required env vars.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const isConfigured = () => !!process.env.BREVO_API_KEY;

// Best-effort send: throws on failure so callers (otp.service) can decide
// whether that's fatal (e.g. login OTP must be sent) - unlike the generic
// notification email helper, OTP delivery failing IS the request failing.
// `replyTo` defaults to SUPPORT_EMAIL (falling back to EMAIL_FROM) so a
// recipient who hits "Reply" lands somewhere monitored instead of the
// Brevo sending address - previously unset entirely. `headers` is an
// optional passthrough (e.g. List-Unsubscribe on broadcast sends - see
// broadcast.service.js) for anything a specific caller needs that isn't
// worth a named param here.
const sendTransactionalEmail = async ({ to, toName, subject, html, text, replyTo, headers }) => {
    if (!isConfigured()) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Email delivery is not configured (BREVO_API_KEY missing).");
        }
        console.warn(`[Brevo not configured] Would send "${subject}" to ${to}:\n${text}`);
        return { simulated: true };
    }

    const replyToEmail = replyTo || process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;

    const response = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            "api-key": process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
            sender: {
                email: process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM,
                name: process.env.BREVO_SENDER_NAME || "NEXORA"
            },
            to: [{ email: to, name: toName || undefined }],
            ...(replyToEmail ? { replyTo: { email: replyToEmail } } : {}),
            subject,
            htmlContent: html,
            textContent: text,
            ...(headers ? { headers } : {})
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Brevo email send failed (${response.status}): ${body}`);
    }

    return response.json();
};

module.exports = { sendTransactionalEmail, isConfigured };
