// Brevo transactional email, called over their HTTPS API rather than SMTP.
//
// Why not nodemailer/SMTP like backend/src/utils/sendEmail.js? Render's
// free-tier network is IPv6-only outbound in places, which is exactly the
// class of problem that has bitten this project before (see MERISMADE's
// `family: 4` fix for Gmail SMTP). Brevo's REST API runs over normal
// HTTPS, so there's no SMTP port/IP-family issue to fight - just an API
// key. Uses the built-in fetch (Node 18+).
//
// Required env var: BREVO_API_KEY
// Optional: BREVO_SENDER_EMAIL (defaults to EMAIL_FROM / EMAIL_USER),
//           BREVO_SENDER_NAME (defaults to "NEXORA")

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const isConfigured = () => !!process.env.BREVO_API_KEY;

// Best-effort send: throws on failure so callers (otp.service) can decide
// whether that's fatal (e.g. login OTP must be sent) - unlike the generic
// notification email helper, OTP delivery failing IS the request failing.
const sendTransactionalEmail = async ({ to, toName, subject, html, text }) => {
    if (!isConfigured()) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Email delivery is not configured (BREVO_API_KEY missing).");
        }
        console.warn(`[Brevo not configured] Would send "${subject}" to ${to}:\n${text}`);
        return { simulated: true };
    }

    const response = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            "api-key": process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
            sender: {
                email: process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER,
                name: process.env.BREVO_SENDER_NAME || "NEXORA"
            },
            to: [{ email: to, name: toName || undefined }],
            subject,
            htmlContent: html,
            textContent: text
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Brevo email send failed (${response.status}): ${body}`);
    }

    return response.json();
};

module.exports = { sendTransactionalEmail, isConfigured };
