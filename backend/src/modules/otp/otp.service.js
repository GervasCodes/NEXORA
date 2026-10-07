const bcrypt = require("bcrypt");

const otpRepository = require("./otp.repository");
const { sendTransactionalEmail } = require("../../config/brevo");
const smsProvider = require("../sms/providers/sms.provider");
const whatsappProvider = require("../whatsapp/providers/whatsapp.provider");
const { renderEmail } = require("../../utils/emailTemplate");
const { t, resolveLocale } = require("../../i18n");
const logger = require("../../utils/logger").child({ module: "otp" });

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 5;
const RESEND_THROTTLE_MINUTES = 1;
const MAX_REQUESTS_PER_WINDOW = 5;
const CHANNELS = ["email", "sms", "whatsapp"];

// (OTP resend/expiry UX) - exported so callers that need to hand
// the frontend an expiry countdown (but aren't themselves the ones
// calling requestOtp - e.g. passwordReset.service.js's anti-enumeration
// path, which must return the same value whether or not the account
// exists) don't have to duplicate this constant.
exports.OTP_EXPIRY_SECONDS = EXPIRY_MINUTES * 60;
// Mirrors the server-side resend throttle above, so the frontend's
// resend-button cooldown can match the actual rule instead of guessing.
exports.RESEND_THROTTLE_SECONDS = RESEND_THROTTLE_MINUTES * 60;

const generateCode = () => {
    // Zero-padded 6-digit code, e.g. "042917" - never fewer than 6 digits.
    return String(Math.floor(Math.random() * 1_000_000)).padStart(CODE_LENGTH, "0");
};

const SUBJECT_PURPOSES = ["login", "password_reset", "password_change"];
const INTRO_PURPOSES = ["login", "password_reset", "password_change"];

// Email and SMS copy comes from the recipient's own locale, same as
// notifications. Unknown purposes fall back to the generic wording.
const buildMessages = (locale, purpose, code) => {
    const subject = t(locale, `otp.subject.${SUBJECT_PURPOSES.includes(purpose) ? purpose : "default"}`);
    const intro = t(locale, `otp.intro.${INTRO_PURPOSES.includes(purpose) ? purpose : "password_change"}`);
    const minutes = String(EXPIRY_MINUTES);

    return {
        subject,
        email: renderEmail({
            locale,
            heading: subject,
            message: `${intro}\n\n${t(locale, "otp.expiry", { minutes })}`,
            code
        }),
        sms: t(locale, "otp.sms", { code, minutes })
    };
};

// SMS and WhatsApp are optional: each is offered only when its env is set
// (SMS gateway keys; WhatsApp Cloud API keys plus an approved OTP template
// name). This check touches no account, so it reveals nothing about whether
// an account exists.
const channelConfigured = (channel) => {
    if (channel === "email") return true;
    if (channel === "sms") return smsProvider.isConfigured();
    if (channel === "whatsapp") {
        return whatsappProvider.isConfigured() && Boolean(process.env.WHATSAPP_OTP_TEMPLATE_NAME);
    }
    return false;
};

const sendOn = async (channel, user, code, messages) => {
    if (channel === "email") {
        await sendTransactionalEmail({
            to: user.email,
            toName: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
            subject: messages.subject,
            text: messages.email.text,
            html: messages.email.html
        });
        return;
    }

    const result = channel === "sms"
        ? await smsProvider.sendText(user.phone, messages.sms)
        : await whatsappProvider.sendOtpTemplate(user.phone, code);

    if (!result || result.success === false) {
        throw new Error(`${channel} gateway did not accept the message`);
    }
};

// Tries the one channel the user picked. Never throws and never falls back
// to another channel: the user is told it failed and picks another method
// themselves. Email is always configured; SMS/WhatsApp need a phone on file.
const deliverCode = async (user, purpose, code, channel) => {
    const locale = resolveLocale(user.language);
    const reachable = channel === "email" ? Boolean(user.email) : Boolean(user.phone);

    if (!channelConfigured(channel) || !reachable) {
        return { delivered: false, reason: "not_available" };
    }

    try {
        await sendOn(channel, user, code, buildMessages(locale, purpose, code));
        return { delivered: true, reason: null };
    } catch (error) {
        logger.warn({ err: error, channel, userId: user.id, purpose }, "one-time code delivery failed on this channel");
        return { delivered: false, reason: "send_failed" };
    }
};

// Generates a code, stores its hash and delivers it on the chosen channel.
// Returns { expiresInSeconds, channel, delivered, reason }. A channel that
// isn't set up or fails does not throw; the caller shows "choose another
// method". Only the one new code is retired on failure, so a code the user
// already received keeps working.
exports.requestOtp = async (user, purpose, { channel = "email" } = {}) => {
    if (!CHANNELS.includes(channel)) {
        throw new Error("Unsupported code channel.");
    }

    const recentCount = await otpRepository.countRecent(user.id, purpose, RESEND_THROTTLE_MINUTES);
    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
        throw new Error("Too many codes requested. Please wait a minute and try again.");
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

    const newId = await otpRepository.create(user.id, purpose, codeHash, expiresAt);
    const { delivered, reason } = await deliverCode(user, purpose, code, channel);

    if (delivered) {
        await otpRepository.invalidateOthers(user.id, purpose, newId);
    } else {
        await otpRepository.consume(newId);
    }

    return { expiresInSeconds: EXPIRY_MINUTES * 60, channel, delivered, reason };
};

exports.channelConfigured = channelConfigured;

// `failureReason` is a machine-readable tag for callers that need to tell a
// genuinely wrong guess apart from an expired/used-up code (login lockout
// only counts the former - see login.service.js) and for monitoring logs.
// It is never sent to the client; the message is unchanged.
const otpError = (message, failureReason) => Object.assign(new Error(message), { failureReason });

// Verifies a submitted code against the active one for that user/purpose.
// Consumes the code on success so it can't be reused; tracks attempts so a
// leaked/guessed-at code can't be brute-forced indefinitely.
exports.verifyOtp = async (userId, purpose, submittedCode) => {
    const record = await otpRepository.findActive(userId, purpose);

    if (!record) {
        throw otpError("No active code found. Please request a new one.", "otp_missing");
    }

    if (new Date(record.expires_at) < new Date()) {
        throw otpError("This code has expired. Please request a new one.", "otp_expired");
    }

    if (record.attempts >= record.max_attempts) {
        throw otpError("Too many incorrect attempts. Please request a new code.", "otp_attempts_exceeded");
    }

    const match = await bcrypt.compare(String(submittedCode || ""), record.code_hash);

    if (!match) {
        await otpRepository.incrementAttempts(record.id);
        throw otpError("Incorrect code. Please try again.", "otp_incorrect");
    }

    await otpRepository.consume(record.id);
};
