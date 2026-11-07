import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { COUNTRY_CODES, DEFAULT_COUNTRY_DIAL } from "../data/countryCodes";
import Button from "../components/ui/Button";
import FullScreenLoader from "../components/ui/FullScreenLoader";
import Input from "../components/ui/Input";
import ProgressBar from "../components/ui/ProgressBar";
import PasswordStrengthMeter from "../components/ui/PasswordStrengthMeter";
import PageMeta from "../components/PageMeta";
import UsernameField from "../components/UsernameField";
import GoogleSignInButton, { isGoogleSignInConfigured } from "../components/GoogleSignInButton";
import GoogleCompleteProfile from "../components/GoogleCompleteProfile";
import useUploadProgress from "../hooks/useUploadProgress";
import useFormErrors from "../hooks/useFormErrors";
import FieldError from "../components/ui/FieldError";
import { rules, validateFields } from "../utils/formErrors";
import { isValidUsernameFormat, randomSuggestionDigits, suggestUsername } from "../utils/username";

const initialForm = {
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
    role: "buyer",
    seller_mode: "marketplace",
    vehicle_type: "motorcycle",
    vehicle_plate_number: "",
    referral_code: "",
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
    const { register, loginWithGoogle, prefillFromGoogle } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState(() => ({
        ...initialForm,
        referral_code: searchParams.get("ref") || "",
        // /business-tools links here with ?mode=business_tools
        ...(searchParams.get("mode") === "business_tools" ? { role: "seller", seller_mode: "business_tools" } : {})
    }));
    const [countryDial, setCountryDial] = useState(DEFAULT_COUNTRY_DIAL);
    const [files, setFiles] = useState({});
    const [idDocType, setIdDocType] = useState("national_id");
    const [step, setStep] = useState(STEP_ACCOUNT);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const docUpload = useUploadProgress();
    // Phase 6 form-error pattern: per-field messages, focus on the first
    // invalid control. One instance serves both steps (only one form is
    // mounted at a time).
    const { formRef, errors: fieldErrors, showErrors, clearError, clearErrors, hasErrors } = useFormErrors();
    const [usernameStatus, setUsernameStatus] = useState("idle");
    // Phase 7 (round 5) - Google. `googleComplete` = a NEW Google user (buyer)
    // finishing phone/username/terms; it can arrive from the Login page via
    // router state. `googleTicket` = a seller/delivery agent whose name + email
    // were prefilled from Google (email locked, no password, documents still
    // required).
    const [googleComplete, setGoogleComplete] = useState(() =>
        location.state?.googleTicket
            ? { ticket: location.state.googleTicket, profile: location.state.googleProfile, returnTo: location.state.returnTo || null }
            : null
    );
    const [googleTicket, setGoogleTicket] = useState(null);
    const [googleBusy, setGoogleBusy] = useState(false);
    // Suggested once per page load (digits are fixed so the suggestion doesn't
    // flicker while the first name is typed).
    const suggestionDigits = useMemo(() => randomSuggestionDigits(), []);
    const usernameSuggestion = form.first_name.trim().length >= 2
        ? suggestUsername(form.first_name, suggestionDigits)
        : "";

    const update = (field) => (e) => { clearError(field); setForm({ ...form, [field]: e.target.value }); };
    const updateCheckbox = (field) => (e) => { clearError(field); setForm({ ...form, [field]: e.target.checked }); };
    const updateFile = (field) => (e) => { clearError(field); setFiles({ ...files, [field]: e.target.files?.[0] || null }); };

    // A business-tools-only seller skips the marketplace identity review.
    const toolsOnly = form.role === "seller" && form.seller_mode === "business_tools";
    const needsDocuments = (form.role === "seller" && !toolsOnly) || form.role === "delivery_agent";
    const requiredDocs = REQUIRED_DOCS[form.role] || [];
    const googleLocked = Boolean(googleTicket) && form.role !== "buyer";
    const passwordsMismatch = form.confirm_password.length > 0 && form.password !== form.confirm_password;

    
    const handleGoogleCredential = async (credential) => {
        setError("");
        setGoogleBusy(true);

        // Buyers: the normal Google sign-in / sign-up. Sellers and delivery
        // agents: Google only prefills name + email, nothing is created yet.
        if (form.role === "buyer") {
            const result = await loginWithGoogle(credential);
            setGoogleBusy(false);
            if (!result.success) return setError(result.message);
            if (result.status === "signed_in") return navigate("/");
            return setGoogleComplete({ ticket: result.ticket, profile: result.profile, returnTo: null });
        }

        const result = await prefillFromGoogle(credential);
        setGoogleBusy(false);
        if (!result.success) return setError(result.message);
        setGoogleTicket(result.ticket);
        setForm((prev) => ({
            ...prev,
            first_name: result.profile.first_name || prev.first_name,
            last_name: result.profile.last_name || prev.last_name,
            email: result.profile.email,
            password: "",
            confirm_password: ""
        }));
        return undefined;
    };

    const handleAccountStepSubmit = (e) => {
        e.preventDefault();
        setError("");

        const problems = validateFields({
            first_name: [rules.required()],
            last_name: [rules.required()],
            email: [rules.required(), rules.email()],
            // A Google-prefilled seller/agent has no password of its own.
            ...(googleLocked ? {} : {
                password: [rules.required("auth.error.passwordRequired"), rules.minLength(8)],
                confirm_password: [rules.required("auth.error.confirmPasswordRequired"), rules.matches("password", "auth.passwordMismatchError")]
            }),
            terms_accepted: [rules.requiredTrue("auth.termsRequiredError")]
        }, form, t);

        const username = form.username.trim();
        if (!username) {
            problems.username = t("username.required");
        } else if (!isValidUsernameFormat(username) || ["invalid", "reserved", "taken"].includes(usernameStatus)) {
            problems.username = t("username.pickAvailable");
        } else if (usernameStatus === "checking") {
            problems.username = t("username.stillChecking");
        }

        const digitsOnly = form.phone.trim().replace(/[^\d]/g, "");
        if (digitsOnly.length < 7) problems.phone = t("auth.invalidPhoneError");

        showErrors(problems);
        if (Object.keys(problems).length > 0) return;

        if (needsDocuments) {
            setStep(STEP_DOCUMENTS);
            return;
        }

        submitRegistration();
    };

    const handleDocumentsStepSubmit = (e) => {
        e.preventDefault();
        setError("");

        const problems = {};
        for (const doc of requiredDocs) {
            if (doc.field === "id_document") continue; // checked separately below
            if (!files[doc.field]) {
                problems[doc.field] = t("auth.verify.uploadRequired", { label: t(doc.labelKey).toLowerCase() });
            }
        }
        if (!files.id_document) {
            problems.id_document = t("auth.verify.idDocumentRequired");
        } else if (files.id_document.type !== "application/pdf") {
            problems.id_document = t("auth.verify.idDocumentPdfOnly");
        }

        if (form.role === "delivery_agent" && !form.vehicle_plate_number.trim()) {
            problems.vehicle_plate_number = t("auth.verify.plateNumberRequired");
        }

        showErrors(problems);
        if (Object.keys(problems).length > 0) return;

        submitRegistration();
    };

    
    const buildFullPhone = () => `${countryDial}${form.phone.trim().replace(/[^\d]/g, "")}`;

    const submitRegistration = async () => {
        setSubmitting(true);
        setError("");

        const fullPhone = buildFullPhone();
        const formWithPhone = { ...form, phone: fullPhone };
        delete formWithPhone.confirm_password;
        if (form.role !== "seller") delete formWithPhone.seller_mode;
        if (googleLocked) {
            // The server takes the email from the signed ticket, not from here,
            // and a Google account has no password of its own.
            formWithPhone.google_ticket = googleTicket;
            delete formWithPhone.password;
        }
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

        const result = needsDocuments
            ? await register(payload, { onUploadProgress: docUpload.onUploadProgress })
            : await register(payload);
        docUpload.reset();
        setSubmitting(false);

        if (result.success) {
            setStep(STEP_DONE);
            setTimeout(() => navigate("/login"), needsDocuments ? 2200 : 1200);
        } else {
            setError(result.message);
        }
    };

    if (googleComplete) {
        return (
            <GoogleCompleteProfile
                ticket={googleComplete.ticket}
                profile={googleComplete.profile}
                referralCode={form.referral_code}
                returnTo={googleComplete.returnTo}
            />
        );
    }

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
            {/* Sellers and agents only prefill from Google (nothing is created), so only buyers get the blocking loader. */}
            <FullScreenLoader open={googleBusy && form.role === "buyer"} message={t("account.finishingSignIn")} />
                <h1 className="font-display text-2xl mb-1">{t("auth.verify.title")}</h1>
                <p className="text-ash text-sm mb-8">
                    {form.role === "seller"
                        ? t("auth.verify.introSeller")
                        : t("auth.verify.introDeliveryAgent")}
                </p>

                <form ref={formRef} onSubmit={handleDocumentsStepSubmit} noValidate className="space-y-4">
                    <div>
                        <label htmlFor="register-owner-photo" className="block text-sm mb-1">{t("auth.verify.ownerPhotoSeller")}</label>
                        <input
                            id="register-owner-photo"
                            type="file"
                            accept="image/*"
                            required
                            aria-invalid={fieldErrors.owner_photo ? "true" : undefined}
                            aria-describedby={fieldErrors.owner_photo ? "register-owner-photo-error" : undefined}
                            onChange={updateFile("owner_photo")}
                            className={`w-full border rounded-md px-3 py-2 text-base focus-ring bg-paper ${fieldErrors.owner_photo ? "border-coral" : "border-line"}`}
                        />
                        <FieldError id="register-owner-photo">{fieldErrors.owner_photo}</FieldError>
                    </div>

                    <div>
                        <label htmlFor="register-id-doc-type" className="block text-sm mb-1">{t("auth.verify.idDocTypeLabel")}</label>
                        <select
                            id="register-id-doc-type"
                            value={idDocType}
                            onChange={(e) => setIdDocType(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper mb-2"
                        >
                            <option value="national_id">{t("auth.verify.nationalId")}</option>
                            <option value="voter_id">{t("auth.verify.voterId")}</option>
                        </select>
                        <input
                            id="register-id-document"
                            type="file"
                            accept="application/pdf"
                            required
                            aria-label={t("auth.verify.idDocument")}
                            aria-invalid={fieldErrors.id_document ? "true" : undefined}
                            aria-describedby={fieldErrors.id_document ? "register-id-document-error" : undefined}
                            onChange={updateFile("id_document")}
                            className={`w-full border rounded-md px-3 py-2 text-base focus-ring bg-paper ${fieldErrors.id_document ? "border-coral" : "border-line"}`}
                        />
                        <FieldError id="register-id-document">{fieldErrors.id_document}</FieldError>
                        <p className="text-xs text-ash mt-1">{t("auth.verify.idDocumentHint")}</p>
                    </div>

                    {form.role === "delivery_agent" && (
                        <div>
                            <label htmlFor="register-drivers-license" className="block text-sm mb-1">{t("auth.verify.driversLicense")}</label>
                            <input
                                id="register-drivers-license"
                                type="file"
                                accept="application/pdf"
                                required
                                aria-invalid={fieldErrors.drivers_license ? "true" : undefined}
                                aria-describedby={fieldErrors.drivers_license ? "register-drivers-license-error" : undefined}
                                onChange={updateFile("drivers_license")}
                                className={`w-full border rounded-md px-3 py-2 text-base focus-ring bg-paper ${fieldErrors.drivers_license ? "border-coral" : "border-line"}`}
                            />
                            <FieldError id="register-drivers-license">{fieldErrors.drivers_license}</FieldError>
                            <p className="text-xs text-ash mt-1">{t("auth.verify.driversLicenseHint")}</p>
                        </div>
                    )}

                    {form.role === "delivery_agent" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="register-vehicle-type" className="block text-sm mb-1">{t("auth.verify.vehicleTypeLabel")}</label>
                                <select
                                    id="register-vehicle-type"
                                    value={form.vehicle_type}
                                    onChange={update("vehicle_type")}
                                    className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper"
                                >
                                    <option value="bicycle">{t("auth.verify.bicycle")}</option>
                                    <option value="motorcycle">{t("auth.verify.motorcycle")}</option>
                                    <option value="tuktuk">{t("auth.verify.tuktuk")}</option>
                                    <option value="car">{t("auth.verify.car")}</option>
                                    <option value="van">{t("auth.verify.van")}</option>
                                    <option value="truck">{t("auth.verify.truck")}</option>
                                </select>
                            </div>
                            <Input
                                label={t("auth.verify.plateNumberLabel")}
                                required
                                placeholder="e.g. T123 ABC"
                                value={form.vehicle_plate_number}
                                error={fieldErrors.vehicle_plate_number}
                                onChange={update("vehicle_plate_number")}
                            />
                        </div>
                    )}

                    {error && <p role="alert" className="text-coral text-sm">{error}</p>}
                    {hasErrors && <p className="text-coral text-sm">{t("form.error.fixHighlighted")}</p>}

                    {submitting && docUpload.progress !== null && (
                        <ProgressBar value={docUpload.progress} label={t("upload.progress")} showValue />
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            onClick={() => { clearErrors(); setStep(STEP_ACCOUNT); }}
                            variant="secondary"
                            className="flex-1 hover:bg-line/50"
                        >
                            {t("auth.verify.back")}
                        </Button>
                        <Button loading={submitting}
                            type="submit"
                            disabled={submitting}
                            className="flex-1 gap-2"
                        >
                            {submitting ? t("auth.verify.submitting") : t("auth.verify.submitForReview")}
                        </Button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-16">
            <PageMeta title="Create Account" noIndexFollow />
            <h1 className="font-display text-2xl mb-1">{t("auth.registerTitle")}</h1>
            <p className="text-ash text-sm mb-8">{t("auth.registerSubtitle")}</p>

            <form ref={formRef} onSubmit={handleAccountStepSubmit} noValidate className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={t("auth.firstNameLabel")}
                        required
                        autoComplete="given-name"
                        value={form.first_name}
                        error={fieldErrors.first_name}
                        onChange={update("first_name")}
                    />
                    <Input
                        label={t("auth.lastNameLabel")}
                        required
                        autoComplete="family-name"
                        value={form.last_name}
                        error={fieldErrors.last_name}
                        onChange={update("last_name")}
                    />
                </div>

                <UsernameField
                    id="registerUsername"
                    value={form.username}
                    onChange={(username) => { clearError("username"); setForm((prev) => ({ ...prev, username })); }}
                    error={fieldErrors.username}
                    onStatusChange={setUsernameStatus}
                    suggestion={usernameSuggestion}
                />

                <Input
                    label={t("auth.emailLabel")}
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    readOnly={googleLocked}
                    value={form.email}
                    error={fieldErrors.email}
                    onChange={update("email")}
                    hint={googleLocked ? t("auth.google.prefilledNotice") : undefined}
                />

                <div>
                    <label htmlFor="register-phone" className="block text-sm font-medium text-ink mb-1.5">{t("auth.phoneLabel")}</label>
                    <div className="flex gap-2">
                        <select
                            value={countryDial}
                            onChange={(e) => setCountryDial(e.target.value)}
                            aria-label={t("auth.countryCodeLabel")}
                            className="w-32 shrink-0 border border-line rounded-md px-2 py-2 text-base focus-ring bg-paper"
                        >
                            {COUNTRY_CODES.map((c) => (
                                <option key={c.iso2} value={c.dial}>
                                    {c.iso2} {c.dial}
                                </option>
                            ))}
                        </select>
                        <Input
                            id="register-phone"
                            type="tel"
                            required
                            error={fieldErrors.phone}
                            inputMode="numeric"
                            autoComplete="tel-national"
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

                {googleLocked ? (
                    <p className="text-xs text-ash">{t("auth.google.prefilledNoPassword")}</p>
                ) : (
                <>
                <div>
                    <Input
                        label={t("auth.passwordLabel")}
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={form.password}
                        error={fieldErrors.password}
                        onChange={update("password")}
                        hint={t("auth.passwordHint")}
                        showPasswordLabel={t("auth.showPassword")}
                        hidePasswordLabel={t("auth.hidePassword")}
                    />
                    <PasswordStrengthMeter
                        password={form.password}
                        labels={{
                            weak: t("auth.passwordStrengthWeak"),
                            fair: t("auth.passwordStrengthFair"),
                            strong: t("auth.passwordStrengthStrong")
                        }}
                    />
                </div>

                <Input
                    label={t("auth.confirmPasswordLabel")}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={form.confirm_password}
                    onChange={update("confirm_password")}
                    error={fieldErrors.confirm_password || (passwordsMismatch ? t("auth.passwordMismatchError") : undefined)}
                    showPasswordLabel={t("auth.showPassword")}
                    hidePasswordLabel={t("auth.hidePassword")}
                />
                </>
                )}

                <div>
                    <label htmlFor="register-role" className="block text-sm mb-1">{t("auth.roleLabel")}</label>
                    <select id="register-role" value={form.role} onChange={update("role")}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
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

                {form.role === "seller" && (
                    <div>
                        <label htmlFor="register-seller-mode" className="block text-sm mb-1">{t("auth.sellerMode.label")}</label>
                        <select id="register-seller-mode" value={form.seller_mode} onChange={update("seller_mode")}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper">
                            <option value="marketplace">{t("auth.sellerMode.marketplace")}</option>
                            <option value="business_tools">{t("auth.sellerMode.tools")}</option>
                        </select>
                        {toolsOnly && <p className="text-xs text-ash mt-1">{t("auth.sellerMode.toolsHint")}</p>}
                    </div>
                )}

                <div className="flex items-start gap-2">
                    <input
                        type="checkbox"
                        id="terms_accepted"
                        checked={form.terms_accepted}
                        onChange={updateCheckbox("terms_accepted")}
                        aria-invalid={fieldErrors.terms_accepted ? "true" : undefined}
                        aria-describedby={fieldErrors.terms_accepted ? "terms_accepted-error" : undefined}
                        className="mt-1 focus-ring"
                    />
                    <label htmlFor="terms_accepted" className="text-xs text-ash">
                        {t("auth.termsPrefix")}{" "}
                        <Link to="/terms#terms-of-service" target="_blank" className="text-teal hover:underline">
                            {t("auth.termsOfService")}
                        </Link>{" "}
                        {t("auth.and")}{" "}
                        <Link to="/terms#privacy-policy" target="_blank" className="text-teal hover:underline">
                            {t("auth.privacyPolicy")}
                        </Link>.
                    </label>
                </div>
                <FieldError id="terms_accepted">{fieldErrors.terms_accepted}</FieldError>

                {error && <p role="alert" className="text-coral text-sm">{error}</p>}
                {hasErrors && <p className="text-coral text-sm">{t("form.error.fixHighlighted")}</p>}

                <Button loading={submitting} type="submit" disabled={submitting} fullWidth className="gap-2">
                    {submitting ? t("auth.creatingAccount") : needsDocuments ? t("auth.continueToVerification") : t("auth.createAccountButton")}
                </Button>
            </form>

            {isGoogleSignInConfigured && (
                <div className="mt-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="flex-1 border-t border-line" />
                        <span className="text-xs text-ash">{t("auth.google.or")}</span>
                        <span className="flex-1 border-t border-line" />
                    </div>
                    <GoogleSignInButton text="signup_with" onCredential={handleGoogleCredential} disabled={googleBusy || submitting} />
                    {form.role !== "buyer" && (
                        <p className="text-xs text-ash mt-2 text-center">{t("auth.google.signUpHint")}</p>
                    )}
                </div>
            )}

            <p className="text-sm text-ash mt-6">
                {t("auth.haveAccount")} <Link to="/login" className="text-teal hover:underline">{t("auth.signInLink")}</Link>
            </p>
        </div>
    );
}
