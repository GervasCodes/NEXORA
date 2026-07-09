const transporter = require("../config/email");

// Best-effort email send. Deliberately swallows errors so that a missing/
// misconfigured SMTP setup never breaks the actual feature (order placed,
// status changed, etc.) that triggered the email.
const sendEmail = async (to, subject, text) => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        console.warn(`Email not sent (EMAIL_HOST/EMAIL_USER not configured): "${subject}" to ${to}`);
        return;
    }

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to,
            subject,
            text
        });
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error.message);
    }
};

module.exports = sendEmail;
