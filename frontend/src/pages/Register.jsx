import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { COUNTRY_CODES, DEFAULT_COUNTRY_DIAL } from "../data/countryCodes";

const initialForm = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    role: "buyer",
    vehicle_type: "motorcycle",
    vehicle_plate_number: "",
    terms_accepted: false
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
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [form, setForm] = useState(initialForm);
    const [countryDial, setCountryDial] = useState(DEFAULT_COUNTRY_DIAL);
    const [files, setFiles] = useState({});
    const [idDocType, setIdDocType] = useState("national_id");
    const [step, setStep] = useState(STEP_ACCOUNT);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
    const updateCheckbox = (field) => (e) => setForm({ ...form, [field]: e.target.checked });
    const updateFile = (field) => (e) => setFiles({ ...files, [field]: e.target.files?.[0] || null });

    const needsDocuments = form.role === "seller" || form.role === "delivery_agent";
    const requiredDocs = REQUIRED_DOCS[form.role] || [];

    // Step 1 -> step 2 for seller/delivery_agent ("immediately redirect
    // them to a document submission form before account creation").
    // Buyers skip straight to submitting, since they need no documents.
    const handleAccountStepSubmit = (e) => {
        e.preventDefault();
        setError("");

        const digitsOnly = form.phone.trim().replace(/[^\d]/g, "");
        if (digitsOnly.length < 7) {
            setError(t("auth.invalidPhoneError"));
            return;
        }

        if (!form.terms_accepted) {
            setError(t("auth.termsRequiredError"));
            return;
        }

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

        if (form.role === "delivery_agent" && !form.vehicle_plate_number.trim()) {
            setError("Please enter your vehicle's plate number.");
            return;
        }

        submitRegistration();
    };

    // Combine the selected country dial code with the locally-entered
    // number (e.g. "+255" + "712345678") into the single "phone" field
    // the backend expects (see auth.validator.js#registerValidation and
    // the users.phone column).
    const buildFullPhone = () => `${countryDial}${form.phone.trim().replace(/[^\d]/g, "")}`;

    const submitRegistration = async () => {
        setSubmitting(true);
        setError("");

        const fullPhone = buildFullPhone();
        const formWithPhone = { ...form, phone: fullPhone };
        let payload = formWithPhone;

        if (needsDocuments) {
            const formData = new FormData();
            Object.entries(formWithPhone).forEach(([key, value]) => formData.append(key, value));
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

                    {form.role === "delivery_agent" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm mb-1">Vehicle type</label>
                                <select
                                    value={form.vehicle_type}
                                    onChange={update("vehicle_type")}
                                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                                >
                                    <option value="bicycle">Bicycle</option>
                                    <option value="motorcycle">Motorcycle</option>
                                    <option value="tuktuk">Tuk-tuk (Bajaji)</option>
                                    <option value="car">Car</option>
                                    <option value="van">Van</option>
                                    <option value="truck">Truck</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Plate number</label>
                                <input
                                    required
                                    placeholder="e.g. T123 ABC"
                                    value={form.vehicle_plate_number}
                                    onChange={update("vehicle_plate_number")}
                                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                                />
                            </div>
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
                            className="flex-1 bg-mango text-abyss py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
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
            <h1 className="font-display text-2xl mb-1">{t("auth.registerTitle")}</h1>
            <p className="text-ash text-sm mb-8">{t("auth.registerSubtitle")}</p>

            <form onSubmit={handleAccountStepSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm mb-1">{t("auth.firstNameLabel")}</label>
                        <input required value={form.first_name} onChange={update("first_name")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">{t("auth.lastNameLabel")}</label>
                        <input required value={form.last_name} onChange={update("last_name")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("auth.emailLabel")}</label>
                    <input type="email" required value={form.email} onChange={update("email")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("auth.phoneLabel")}</label>
                    <div className="flex gap-2">
                        <select
                            value={countryDial}
                            onChange={(e) => setCountryDial(e.target.value)}
                            aria-label={t("auth.countryCodeLabel")}
                            className="w-32 shrink-0 border border-line rounded-md px-2 py-2 text-sm focus-ring bg-paper"
                        >
                            {COUNTRY_CODES.map((c) => (
                                <option key={c.iso2} value={c.dial}>
                                    {c.iso2} {c.dial}
                                </option>
                            ))}
                        </select>
                        <input
                            type="tel"
                            required
                            inputMode="numeric"
                            placeholder="712 345 678"
                            value={form.phone}
                            onChange={update("phone")}
                            className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>
                    <p className="text-xs text-ash mt-1">
                        {t("auth.phoneHint")}
                    </p>
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("auth.passwordLabel")}</label>
                    <input type="password" required minLength={8} value={form.password} onChange={update("password")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <p className="text-xs text-ash mt-1">{t("auth.passwordHint")}</p>
                </div>

                <div>
                    <label className="block text-sm mb-1">{t("auth.roleLabel")}</label>
                    <select value={form.role} onChange={update("role")}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper">
                        <option value="buyer">{t("auth.roleBuyer")}</option>
                        <option value="seller">{t("auth.roleSeller")}</option>
                        <option value="delivery_agent">{t("auth.roleDeliveryAgent")}</option>
                    </select>
                    {needsDocuments && (
                        <p className="text-xs text-ash mt-1">
                            {t("auth.roleVerificationHint")}
                        </p>
                    )}
                </div>

                <div className="flex items-start gap-2">
                    <input
                        type="checkbox"
                        id="terms_accepted"
                        checked={form.terms_accepted}
                        onChange={updateCheckbox("terms_accepted")}
                        className="mt-1 focus-ring"
                    />
                    <label htmlFor="terms_accepted" className="text-xs text-ash">
                        {t("auth.termsPrefix")}{" "}
                        <Link to="/legal/terms-of-service" target="_blank" className="text-teal hover:underline">
                            {t("auth.termsOfService")}
                        </Link>{" "}
                        {t("auth.and")}{" "}
                        <Link to="/legal/privacy-policy" target="_blank" className="text-teal hover:underline">
                            {t("auth.privacyPolicy")}
                        </Link>.
                    </label>
                </div>

                {error && <p className="text-coral text-sm">{error}</p>}

                <button type="submit" disabled={submitting}
                    className="w-full bg-mango text-abyss py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60">
                    {submitting ? t("auth.creatingAccount") : needsDocuments ? t("auth.continueToVerification") : t("auth.createAccountButton")}
                </button>
            </form>

            <p className="text-sm text-ash mt-6">
                {t("auth.haveAccount")} <Link to="/login" className="text-teal hover:underline">{t("auth.signInLink")}</Link>
            </p>
        </div>
    );
}
