import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
    const { login, verifyLoginOtp, resendLoginOtp } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({ email: "", password: "" });
    const [step, setStep] = useState("credentials"); // 'credentials' | 'otp'
    const [preAuthToken, setPreAuthToken] = useState(null);
    const [maskedEmail, setMaskedEmail] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleCredentials = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const result = await login(form.email, form.password);

        setSubmitting(false);

        if (!result.success) {
            setError(result.message);
            return;
        }

        setPreAuthToken(result.preAuthToken);
        setMaskedEmail(result.maskedEmail);
        setStep("otp");
    };

    const handleOtp = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const result = await verifyLoginOtp(preAuthToken, code);

        setSubmitting(false);

        if (result.success) {
            navigate("/");
        } else {
            setError(result.message);
        }
    };

    const handleResend = async () => {
        setError("");
        setNotice("");
        const result = await resendLoginOtp(preAuthToken);
        setNotice(result.success ? "A new code has been sent." : "");
        if (!result.success) setError(result.message);
    };

    if (step === "otp") {
        return (
            <div className="max-w-sm mx-auto px-4 py-20">
                <h1 className="font-display text-2xl mb-1">Check your email</h1>
                <p className="text-ash text-sm mb-8">
                    We sent a 6-digit code to <span className="font-medium text-ink">{maskedEmail}</span>. Enter it below to finish signing in.
                </p>

                <form onSubmit={handleOtp} className="space-y-4">
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

                    {error && <p className="text-coral text-sm">{error}</p>}
                    {notice && !error && <p className="text-teal text-sm">{notice}</p>}

                    <button
                        type="submit"
                        disabled={submitting || code.length !== 6}
                        className="w-full bg-mango text-abyss py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
                    >
                        {submitting ? "Verifying…" : "Verify & sign in"}
                    </button>
                </form>

                <div className="flex items-center justify-between mt-6 text-sm">
                    <button
                        type="button"
                        onClick={() => { setStep("credentials"); setCode(""); setError(""); setNotice(""); }}
                        className="text-ash hover:text-ink transition-colors"
                    >
                        ← Use a different account
                    </button>
                    <button type="button" onClick={handleResend} className="text-teal hover:underline">
                        Resend code
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-20">
            <h1 className="font-display text-2xl mb-1">Welcome back</h1>
            <p className="text-ash text-sm mb-8">Sign in to your NEXORA account.</p>

            <form onSubmit={handleCredentials} className="space-y-4">
                <div>
                    <label className="block text-sm mb-1">Email</label>
                    <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm">Password</label>
                        <Link to="/forgot-password" className="text-xs text-teal hover:underline">Forgot password?</Link>
                    </div>
                    <input
                        type="password"
                        required
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-mango text-abyss py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
                >
                    {submitting ? "Signing in…" : "Sign in"}
                </button>
            </form>

            <p className="text-sm text-ash mt-6">
                New here? <Link to="/register" className="text-teal hover:underline">Create an account</Link>
            </p>
        </div>
    );
}
