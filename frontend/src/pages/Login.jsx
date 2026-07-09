import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const result = await login(form.email, form.password);

        setSubmitting(false);

        if (result.success) {
            navigate("/");
        } else {
            setError(result.message);
        }
    };

    return (
        <div className="max-w-sm mx-auto px-4 py-20">
            <h1 className="font-display text-2xl mb-1">Welcome back</h1>
            <p className="text-ash text-sm mb-8">Sign in to your NEXORA account.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    <label className="block text-sm mb-1">Password</label>
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
                    className="w-full bg-mango text-ink py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
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
