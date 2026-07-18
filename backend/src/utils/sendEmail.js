const { sendTransactionalEmail } = require("../config/brevo");

// Best-effort email send for general notifications (order updates, etc).
// Deliberately swallows errors so that a missing/misconfigured Brevo
// setup never breaks the actual feature (order placed, status changed,
// etc.) that triggered the email - contrast with OTP delivery
// (otp.service.js), where a send failure IS the request failing, so it
// calls sendTransactionalEmail directly instead of going through here.
const sendEmail = async (to, subject, text) => {
    try {
        await sendTransactionalEmail({ to, subject, text, html: `<p>${text}</p>` });
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error.message);
    }
};

module.exports = sendEmail;
