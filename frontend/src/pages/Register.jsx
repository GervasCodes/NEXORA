import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { COUNTRY_CODES, DEFAULT_COUNTRY_DIAL } from "../data/countryCodes";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import PageMeta from "../components/PageMeta";

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


const REQUIRED_DOCS = {
    seller: [
        { field: "owner_photo", labelKey: "auth.verify.ownerPhotoSeller", hintKey: "auth.verify.selfieHint" },
        { field: "id_document", labelKey: "auth.verify.idDocument", hintKey: "auth.verify.idDocumentHint" }
    ],
    delivery_agent: [
        { field: "owner_photo", labelKey: "auth.verify.ownerPhotoDelivery", hintKey: "auth.verify.selfieHint" },
        { field: "id_document", labelKey: "auth.verify.idDocument", hintKey: "auth.verify.idDocumentHint" },
        { field: "drivers_license", labelKey: "auth.verify.driversLicense", hintKey: "auth.verify.driversLicenseHint" }
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
                setError(t("auth.verify.uploadRequired", { label: t(doc.labelKey).toLowerCase() }));
                return;
            }
        }
        if (!files.id_document) {
            setError(t("auth.verify.idDocumentRequired"));
            return;
        }

        if (form.role === "delivery_agent" && !form.vehicle_plate_number.trim()) {
            setError(t("auth.verify.plateNumberRequired"));
            return;
        }

        submitRegistration();
    };

    
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
                <p className="font-display text-2xl mb-2">{t("auth.verify.accountCreated")}</p>
                {needsDocuments ? (
                    <p className="text-ash text-sm">
                        {t("auth.verify.pendingReviewNotice")}
                    </p>
                ) : (
                    <p className="text-ash text-sm">{t("auth.verify.takingToSignIn")}</p>
                )}
            </div>
        );
    }

    if (step === STEP_DOCUMENTS) {
        return (
            <div className="max-w-sm mx-auto px-4 py-16">
                <h1 className="font-display text-2xl mb-1">{t("auth.verify.title")}</h1>
                <p className="text-ash text-sm mb-8">
                    {form.role === "seller"
                        ? t("auth.verify.introSeller")
                        : t("auth.verify.introDeliveryAgent")}
                </p>

                <form onSubmit={handleDocumentsStepSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">{t("auth.verify.ownerPhotoSeller")}</label>
                        <input
                            type="file"
                            accept="image/*"
                            required
                            onChange={updateFile("owner_photo")}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        />
                    </div>

                    <div>
                        <label className="block text-sm mb-1">{t("auth.verify.idDocTypeLabel")}</label>
                        <select
                            value={idDocType}
                            onChange={(e) => setIdDocType(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper mb-2"
                        >
                            <option value="national_id">{t("auth.verify.nationalId")}</option>
                            <option value="voter_id">{t("auth.verify.voterId")}</option>
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
                            <label className="block text-sm mb-1">{t("auth.verify.driversLicense")}</label>
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
                                <label className="block text-sm mb-1">{t("auth.verify.vehicleTypeLabel")}</label>
                                <select
                                    value={form.vehicle_type}
                                    onChange={update("vehicle_type")}
                                    className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                                >
                                    <option value="bicycle">{t("auth.verify.bicycle")}</option>
                                    <option value="motorcycle">{t("auth.verify.motorcycle")}</option>
                                    <option value="tuktuk">{t("auth.verify.tuktuk")}</option>
                                    <option value="car">{t("auth.verify.car")}</option>
                                    <option value="van">{t("auth.verify.van")}</option>
                                    <option value="truck">{t("auth.verify.truck")}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">{t("auth.verify.plateNumberLabel")}</label>
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

                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            onClick={() => setStep(STEP_ACCOUNT)}
                            variant="secondary"
                            className="flex-1 hover:bg-line/50"
                        >
                            {t("auth.verify.back")}
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 gap-2"
                        >
                            {submitting && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                            {submitting ? t("auth.verify.submitting") : t("auth.verify.submitForReview")}
                        </Button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-16">
            <PageMeta title="Create Account" />
            <h1 className="font-display text-2xl mb-1">{t("auth.registerTitle")}</h1>
            <p className="text-ash text-sm mb-8">{t("auth.registerSubtitle")}</p>

            <form onSubmit={handleAccountStepSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={t("auth.firstNameLabel")}
                        required
                        value={form.first_name}
                        onChange={update("first_name")}
                    />
                    <Input
                        label={t("auth.lastNameLabel")}
                        required
                        value={form.last_name}
                        onChange={update("last_name")}
                    />
                </div>

                <Input
                    label={t("auth.emailLabel")}
                    type="email"
                    required
                    value={form.email}
                    onChange={update("email")}
                />

                <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t("auth.phoneLabel")}</label>
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
                        <Input
                            type="tel"
                            required
                            inputMode="numeric"
                            placeholder="712 345 678"
                            value={form.phone}
                            onChange={update("phone")}
                            className="flex-1"
                        />
                    </div>
                    <p className="text-xs text-ash mt-1">
                        {t("auth.phoneHint")}
                    </p>
                </div>

                <Input
                    label={t("auth.passwordLabel")}
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={update("password")}
                    hint={t("auth.passwordHint")}
                />

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

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}

                <Button type="submit" disabled={submitting} fullWidth className="gap-2">
                    {submitting && <span className="w-4 h-4 border-2 border-abyss/30 border-t-abyss rounded-full animate-spin" />}
                    {submitting ? t("auth.creatingAccount") : needsDocuments ? t("auth.continueToVerification") : t("auth.createAccountButton")}
                </Button>
            </form>

            <p className="text-sm text-ash mt-6">
                {t("auth.haveAccount")} <Link to="/login" className="text-teal hover:underline">{t("auth.signInLink")}</Link>
            </p>
        </div>
    );
}
