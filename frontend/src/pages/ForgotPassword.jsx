import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import PageMeta from "../components/PageMeta";
import { useLanguage } from "../context/LanguageContext";

// Phase 5 (OTP resend/expiry UX) - same fallback/cooldown values as
// Login.jsx's OTP step, mirroring otp.service.js's real
// EXPIRY_MINUTES/RESEND_THROTTLE_MINUTES.
// Phase 10 (Swahili for remaining pages): this page now goes through the
// same i18n t() system as Login.jsx instead of staying plain English.
const OTP_EXPIRY_FALLBACK_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;

const formatCountdown = (totalSeconds) => {
    const clamped = Math.max(0, totalSeconds);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function ForgotPassword() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [step, setStep] = useState("email"); // 'email' | 'reset'
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // Phase 5 (OTP resend/expiry UX) - live "expires in mm:ss" plus a
    // resend-button cooldown, same shape as Login.jsx's OTP step.
    const [expiresIn, setExpiresIn] = useState(OTP_EXPIRY_FALLBACK_SECONDS);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resending, setResending] = useState(false);
    const tickRef = useRef(null);

    useEffect(() => {
        if (step !== "reset") return undefined;

        clearInterval(tickRef.current);
        tickRef.current = setInterval(() => {
            setExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
            setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(tickRef.current);
    }, [step]);

    const handleRequest = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            const { data } = await api.post("/auth/forgot-password", { email });

            setNotice(t("forgotPassword.codeOnWay"));
            setExpiresIn(data.data?.expiresInSeconds || OTP_EXPIRY_FALLBACK_SECONDS);
            setStep("reset");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    // Re-requesting a code is the same endpoint as the initial request -
    // there's no separate resend route for password reset (unlike
    // login's /auth/login/resend-otp). The anti-enumeration behavior is
    // unaffected: this always responds success regardless of whether the
    // account exists, same as the first call.
    const handleResend = async (channel = "email") => {
        if (resendCooldown > 0 || resending) return;
        setResending(true);
        setError("");
        setNotice("");
        try {
            const { data } = await api.post("/auth/forgot-password", { email, channel });

            // Global setup check only (never per-account), so this can't reveal
            // whether the email is registered.
            if (data.data?.channelUnavailable) {
                setError(t("forgotPassword.channelUnavailable"));
                return;
            }

            setNotice(t("forgotPassword.resent", { channel: t(`forgotPassword.channel.${channel}`) }));
            setExpiresIn(data.data?.expiresInSeconds || OTP_EXPIRY_FALLBACK_SECONDS);
            setResendCooldown(RESEND_COOLDOWN_SECONDS);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setResending(false);
        }
    };

    const handleReset = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await api.post("/auth/reset-password", { email, code, new_password: newPassword });
            navigate("/login");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-sm mx-auto px-4 py-20">
            <PageMeta title={t("forgotPassword.title")} noIndexFollow />
            <h1 className="font-display text-2xl mb-1">{t("forgotPassword.title")}</h1>
            <p className="text-ash text-sm mb-8">
                {step === "email"
                    ? t("forgotPassword.intro.email")
                    : t("forgotPassword.intro.reset", { email })}
            </p>

            {step === "email" ? (
                <form onSubmit={handleRequest} className="space-y-4">
                    <Input
                        label={t("forgotPassword.emailLabel")}
                        type="email"
                        required
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                    <Button
                        type="submit"
                        disabled={submitting}
                        fullWidth
                    >
                        {submitting ? t("forgotPassword.sending") : t("forgotPassword.sendCode")}
                    </Button>
                </form>
            ) : (
                <form onSubmit={handleReset} className="space-y-4">
                    <div>
                        <label htmlFor="resetCode" className="block text-sm mb-1">{t("forgotPassword.codeLabel")}</label>
                        <input
                            id="resetCode"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            className="w-full border border-line rounded-md px-3 py-2 text-center text-lg tracking-[0.5em] font-mono focus-ring"
                            placeholder="000000"
                        />
                    </div>
                    <Input
                        label={t("forgotPassword.newPasswordLabel")}
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        showPasswordLabel={t("forgotPassword.showPassword")}
                        hidePasswordLabel={t("forgotPassword.hidePassword")}
                    />

                    <p className={`text-xs ${expiresIn > 0 ? "text-ash" : "text-coral"}`}>
                        {expiresIn > 0
                            ? t("forgotPassword.expiresIn", { time: formatCountdown(expiresIn) })
                            : t("forgotPassword.expired")}
                    </p>

                    {notice && !error && <p className="text-teal text-sm">{notice}</p>}
                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                    <Button
                        type="submit"
                        disabled={submitting || code.length !== 6}
                        fullWidth
                    >
                        {submitting ? t("forgotPassword.resetting") : t("forgotPassword.resetButton")}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                        <button
                            type="button"
                            onClick={() => { setStep("email"); setError(""); setNotice(""); }}
                            className="text-ash hover:text-ink transition-colors"
                        >
                            ← {t("forgotPassword.useDifferentEmail")}
                        </button>
                        <div className="text-right">
                            <p className="text-xs text-ash mb-1">{t("forgotPassword.sendBy")}</p>
                            <div className="flex gap-3 justify-end">
                                {["email", "sms", "whatsapp"].map((channel) => (
                                    <button
                                        key={channel}
                                        type="button"
                                        onClick={() => handleResend(channel)}
                                        disabled={resendCooldown > 0 || resending}
                                        className="text-teal hover:underline disabled:text-ash disabled:no-underline disabled:cursor-not-allowed"
                                    >
                                        {t(`forgotPassword.channel.${channel}`)}
                                    </button>
                                ))}
                            </div>
                            {resendCooldown > 0 && <p className="text-xs text-ash mt-1">{t("forgotPassword.resendIn", { seconds: resendCooldown })}</p>}
                        </div>
                    </div>
                </form>
            )}

            <p className="text-sm text-ash mt-6">
                <Link to="/login" className="text-teal hover:underline">{t("forgotPassword.backToSignIn")}</Link>
            </p>
        </div>
    );
}
