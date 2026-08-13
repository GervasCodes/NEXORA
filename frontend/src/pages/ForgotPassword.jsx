import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import PageMeta from "../components/PageMeta";

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState("email"); // 'email' | 'reset'
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleRequest = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            await api.post("/auth/forgot-password", { email });
            
            setNotice("If an account exists for that email, a reset code is on its way.");
            setStep("reset");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
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
                    />

                    {notice && !error && <p className="text-teal text-sm">{notice}</p>}
                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                    <Button
                        type="submit"
                        disabled={submitting || code.length !== 6}
                        fullWidth
                    >
                        {submitting ? "Resetting…" : "Reset password"}
                    </Button>

                    <button
                        type="button"
                        onClick={() => { setStep("email"); setError(""); setNotice(""); }}
                        className="w-full text-sm text-ash hover:text-ink transition-colors"
                    >
                        ← Use a different email
                    </button>
                </form>
            )}

            <p className="text-sm text-ash mt-6">
                <Link to="/login" className="text-teal hover:underline">Back to sign in</Link>
            </p>
        </div>
    );
}
