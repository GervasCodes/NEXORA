import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import PageMeta from "../components/PageMeta";

// Phase 5 (OTP resend/expiry UX) - same fallback/cooldown values as
// Login.jsx's OTP step, mirroring otp.service.js's real
// EXPIRY_MINUTES/RESEND_THROTTLE_MINUTES. This file doesn't use the
// i18n t() system (it never has - unlike Login.jsx, it wasn't part of
// the earlier i18n rollout), so these stay plain English strings to
// match the rest of the page.
const OTP_EXPIRY_FALLBACK_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;

const formatCountdown = (totalSeconds) => {
    const clamped = Math.max(0, totalSeconds);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function ForgotPassword() {
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

            setNotice("If an account exists for that email, a reset code is on its way.");
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
    const handleResend = async () => {
        if (resendCooldown > 0 || resending) return;
        setResending(true);
        setError("");
        setNotice("");
        try {
            const { data } = await api.post("/auth/forgot-password", { email });

            setNotice("A new code is on its way.");
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
            <PageMeta title="Reset Password" />
            <h1 className="font-display text-2xl mb-1">Reset your password</h1>
            <p className="text-ash text-sm mb-8">
                {step === "email"
                    ? "Enter your account email and we'll send you a reset code."
                    : `Enter the code sent to ${email}, and choose a new password.`}
            </p>

            {step === "email" ? (
                <form onSubmit={handleRequest} className="space-y-4">
                    <Input
                        label="Email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                    <Button
                        type="submit"
                        disabled={submitting}
                        fullWidth
                    >
                        {submitting ? "Sending…" : "Send reset code"}
                    </Button>
                </form>
            ) : (
                <form onSubmit={handleReset} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">Verification code</label>
                        <input
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
                        label="New password"
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        showPasswordLabel="Show password"
                        hidePasswordLabel="Hide password"
                    />

                    <p className={`text-xs ${expiresIn > 0 ? "text-ash" : "text-coral"}`}>
                        {expiresIn > 0
                            ? `Code expires in ${formatCountdown(expiresIn)}`
                            : "Your code has expired. Request a new one below."}
                    </p>

                    {notice && !error && <p className="text-teal text-sm">{notice}</p>}
                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                    <Button
                        type="submit"
                        disabled={submitting || code.length !== 6}
                        fullWidth
                    >
                        {submitting ? "Resetting…" : "Reset password"}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                        <button
                            type="button"
                            onClick={() => { setStep("email"); setError(""); setNotice(""); }}
                            className="text-ash hover:text-ink transition-colors"
                        >
                            ← Use a different email
                        </button>
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={resendCooldown > 0 || resending}
                            className="text-teal hover:underline disabled:text-ash disabled:no-underline disabled:cursor-not-allowed"
                        >
                            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                        </button>
                    </div>
                </form>
            )}

            <p className="text-sm text-ash mt-6">
                <Link to="/login" className="text-teal hover:underline">Back to sign in</Link>
            </p>
        </div>
    );
}
