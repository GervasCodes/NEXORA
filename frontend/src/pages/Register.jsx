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

// Which document fields each role needs before an account can be
// created. Buyers need none - registration stays a single fast step for
// them. Sellers and delivery agents are routed into a second step that
// collects these before the account is ever submitted to the server;
// see auth.service.js#register on the backend for how "no account until
// documents are uploaded and validated" is enforced.
const REQUIRED_DOCS = {
    seller: [
        { field: "owner_photo", label: "Owner photo / selfie", hint: "A clear photo of your face." },
        { field: "id_document", label: "National ID or Voter ID", hint: "A photo or scan of either document." }
    ],
    delivery_agent: [
        { field: "owner_photo", label: "Personal photo / selfie", hint: "A clear photo of your face." },
        { field: "id_document", label: "National ID or Voter ID", hint: "A photo or scan of either document." },
        { field: "drivers_license", label: "Driver's license", hint: "A photo or scan of your license." }
    ]
};

const STEP_ACCOUNT = "account";
const STEP_DOCUMENTS = "documents";
const STEP_DONE = "done";

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState(initialForm);
    const [files, setFiles] = useState({});
    const [idDocType, setIdDocType] = useState("national_id");
    const [step, setStep] = useState(STEP_ACCOUNT);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
    const updateFile = (field) => (e) => setFiles({ ...files, [field]: e.target.files?.[0] || null });

    const needsDocuments = form.role === "seller" || form.role === "delivery_agent";
    const requiredDocs = REQUIRED_DOCS[form.role] || [];

    // Step 1 -> step 2 for seller/delivery_agent ("immediately redirect
    // them to a document submission form before account creation").
    // Buyers skip straight to submitting, since they need no documents.
    const handleAccountStepSubmit = (e) => {
        e.preventDefault();
        setError("");

        if (needsDocuments) {
            setStep(STEP_DOCUMENTS);
            return;
        }

        submitRegistration();
    };

    const handleDocumentsStepSubmit = (e) => {
        e.preventDefault();
        setError("");

        for (const doc of requiredDocs) {
            if (doc.field === "id_document") continue; // checked separately below
            if (!files[doc.field]) {
                setError(`Please upload your ${doc.label.toLowerCase()}.`);
                return;
            }
        }
        if (!files.id_document) {
            setError("Please upload your National ID or Voter ID.");
            return;
        }

        submitRegistration();
    };

    const submitRegistration = async () => {
        setSubmitting(true);
        setError("");

        let payload = form;

        if (needsDocuments) {
            const formData = new FormData();
            Object.entries(form).forEach(([key, value]) => formData.append(key, value));
            formData.append("owner_photo", files.owner_photo);
            formData.append(idDocType, files.id_document);
            if (form.role === "delivery_agent") {
                formData.append("drivers_license", files.drivers_license);
            }
            payload = formData;
        }

        const result = await register(payload);
        setSubmitting(false);

        if (result.success) {
            setStep(STEP_DONE);
            setTimeout(() => navigate("/login"), needsDocuments ? 2200 : 1200);
        } else {
            setError(result.message);
        }
    };

    if (step === STEP_DONE) {
        return (
            <div className="max-w-sm mx-auto px-4 py-24 text-center">
                <p className="font-display text-2xl mb-2">Account created</p>
                {needsDocuments ? (
                    <p className="text-ash text-sm">
                        Your documents were submitted for review. You can sign in now — your
                        dashboard will show "Pending Review" until an admin approves your account.
                    </p>
                ) : (
                    <p className="text-ash text-sm">Taking you to sign in…</p>
                )}
            </div>
        );
    }

    if (step === STEP_DOCUMENTS) {
        return (
            <div className="max-w-sm mx-auto px-4 py-16">
                <h1 className="font-display text-2xl mb-1">Verify your identity</h1>
                <p className="text-ash text-sm mb-8">
                    {form.role === "seller"
                        ? "Sellers must submit these documents before their account is created. Your account will show as \"Pending Review\" until an admin approves it."
                        : "Delivery agents must submit these documents before their account is created. Your account will show as \"Pending Review\" until an admin approves it."}
                </p>

                <form onSubmit={handleDocumentsStepSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">Owner photo / selfie</label>
                        <input
                            type="file"
                            accept="image/*"
                            required
                            onChange={updateFile("owner_photo")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        />
                    </div>

                    <div>
                        <label className="block text-sm mb-1">ID document type</label>
                        <select
                            value={idDocType}
                            onChange={(e) => setIdDocType(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper mb-2"
                        >
                            <option value="national_id">National ID</option>
                            <option value="voter_id">Voter ID</option>
                        </select>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            required
                            onChange={updateFile("id_document")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        />
                    </div>

                    {form.role === "delivery_agent" && (
                        <div>
                            <label className="block text-sm mb-1">Driver's license</label>
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                required
                                onChange={updateFile("drivers_license")}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                            />
                        </div>
                    )}

                    {error && <p className="text-coral text-sm">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(STEP_ACCOUNT)}
                            className="flex-1 border border-line py-2.5 rounded-md font-medium hover:bg-line/50 transition-colors focus-ring"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 bg-mango text-ink py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
                        >
                            {submitting ? "Submitting…" : "Submit for review"}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-16">
            <h1 className="font-display text-2xl mb-1">Join NEXORA</h1>
            <p className="text-ash text-sm mb-8">Create your account to start buying, selling, or delivering.</p>

            <form onSubmit={handleAccountStepSubmit} className="space-y-4">
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
                    {needsDocuments && (
                        <p className="text-xs text-ash mt-1">
                            You'll be asked to verify your identity on the next step before your account is created.
                        </p>
                    )}
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button type="submit" disabled={submitting}
                    className="w-full bg-mango text-ink py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? "Creating account…" : needsDocuments ? "Continue to verification" : "Create account"}
                </button>
            </form>

            <p className="text-sm text-ash mt-6">
                Already have an account? <Link to="/login" className="text-teal hover:underline">Sign in</Link>
            </p>
        </div>
    );
}
