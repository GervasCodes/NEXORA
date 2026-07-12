const bcrypt = require("bcrypt");

const otpRepository = require("./otp.repository");
const { sendTransactionalEmail } = require("../../config/brevo");

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 5;
const RESEND_THROTTLE_MINUTES = 1;
const MAX_REQUESTS_PER_WINDOW = 5;

const generateCode = () => {
    // Zero-padded 6-digit code, e.g. "042917" - never fewer than 6 digits.
    return String(Math.floor(Math.random() * 1_000_000)).padStart(CODE_LENGTH, "0");
};

const SUBJECTS = {
    login: "Your NEXORA sign-in code",
    password_change: "Your NEXORA password change code"
};

const bodyFor = (purpose, code) => {
    const intro = purpose === "login"
        ? "Use this code to finish signing in to NEXORA:"
        : "Use this code to verify it's you before changing your NEXORA password:";

    return {
        text: `${intro}\n\n${code}\n\nThis code expires in ${EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.`,
        html: `<p>${intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${code}</p><p>This code expires in ${EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.</p>`
    };
};

// Generates a code, stores its hash, emails it. Throws if the send fails
// (unlike the app's fire-and-forget notification emails, OTP delivery
// failing means the caller genuinely cannot proceed).
exports.requestOtp = async (user, purpose) => {
    const recentCount = await otpRepository.countRecent(user.id, purpose, RESEND_THROTTLE_MINUTES);
    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
        throw new Error("Too many codes requested. Please wait a minute and try again.");
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

    await otpRepository.invalidateActive(user.id, purpose);
    await otpRepository.create(user.id, purpose, codeHash, expiresAt);

    const { text, html } = bodyFor(purpose, code);

    await sendTransactionalEmail({
        to: user.email,
        toName: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
        subject: SUBJECTS[purpose] || "Your NEXORA verification code",
        text,
        html
    });

    return { expiresInSeconds: EXPIRY_MINUTES * 60 };
};

// Verifies a submitted code against the active one for that user/purpose.
// Consumes the code on success so it can't be reused; tracks attempts so a
// leaked/guessed-at code can't be brute-forced indefinitely.
exports.verifyOtp = async (userId, purpose, submittedCode) => {
    const record = await otpRepository.findActive(userId, purpose);

    if (!record) {
        throw new Error("No active code found. Please request a new one.");
    }

    if (new Date(record.expires_at) < new Date()) {
        throw new Error("This code has expired. Please request a new one.");
    }

    if (record.attempts >= record.max_attempts) {
        throw new Error("Too many incorrect attempts. Please request a new code.");
    }

    const match = await bcrypt.compare(String(submittedCode || ""), record.code_hash);

    if (!match) {
        await otpRepository.incrementAttempts(record.id);
        throw new Error("Incorrect code. Please try again.");
    }

    await otpRepository.consume(record.id);
};
