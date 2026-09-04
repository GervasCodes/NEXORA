import { getPasswordStrength } from "../../utils/passwordStrength";

/**
 * Shared PasswordStrengthMeter - Phase 0 (UI/UX remediation).
 *
 * Small three-segment bar + label, updated live as the user types. Kept
 * context-free (like EmptyState/ErrorState) - callers pass already-
 * translated `labels` so this doesn't take a LanguageContext dependency.
 *
 * Renders nothing for an empty password so it doesn't clutter a blank
 * form on first render.
 */
const COLORS = {
    weak: "bg-coral",
    fair: "bg-mango",
    strong: "bg-teal"
};

export default function PasswordStrengthMeter({
    password,
    labels = { weak: "Weak", fair: "Fair", strong: "Strong" }
}) {
    const { score, label } = getPasswordStrength(password);

    if (!password) return null;

    return (
        <div className="mt-1.5" aria-live="polite">
            <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3].map((segment) => (
                    <span
                        key={segment}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                            segment <= score ? COLORS[label] || "bg-line" : "bg-line"
                        }`}
                    />
                ))}
            </div>
            <p className={`text-xs mt-1 ${label === "weak" ? "text-coral" : label === "fair" ? "text-mango-dark" : "text-teal"}`}>
                {labels[label] || label}
            </p>
        </div>
    );
}
