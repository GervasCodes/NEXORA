import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const initialForm = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    role: "buyer"
};

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState(initialForm);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const result = await register(form);

        setSubmitting(false);

        if (result.success) {
            setSuccess(true);
            setTimeout(() => navigate("/login"), 1200);
        } else {
            setError(result.message);
        }
    };

    if (success) {
        return (
            <div className="max-w-sm mx-auto px-4 py-24 text-center">
                <p className="font-display text-2xl mb-2">Account created</p>
                <p className="text-ash text-sm">Taking you to sign in…</p>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-16">
            <h1 className="font-display text-2xl mb-1">Join NEXORA</h1>
            <p className="text-ash text-sm mb-8">Create your account to start buying, selling, or delivering.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">First name</label>
                        <input required value={form.first_name} onChange={update("first_name")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Last name</label>
                        <input required value={form.last_name} onChange={update("last_name")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm mb-1">Email</label>
                    <input type="email" required value={form.email} onChange={update("email")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Phone</label>
                    <input required value={form.phone} onChange={update("phone")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">Password</label>
                    <input type="password" required minLength={8} value={form.password} onChange={update("password")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <p className="text-xs text-ash mt-1">At least 8 characters.</p>
                </div>

                <div>
                    <label className="block text-sm mb-1">I want to</label>
                    <select value={form.role} onChange={update("role")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                        <option value="buyer">Buy products</option>
                        <option value="seller">Sell products</option>
                        <option value="delivery_agent">Deliver orders</option>
                    </select>
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button type="submit" disabled={submitting}
                    className="w-full bg-mango text-ink py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? "Creating account…" : "Create account"}
                </button>
            </form>

            <p className="text-sm text-ash mt-6">
                Already have an account? <Link to="/login" className="text-teal hover:underline">Sign in</Link>
            </p>
        </div>
    );
}
