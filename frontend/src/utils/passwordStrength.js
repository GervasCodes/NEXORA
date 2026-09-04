/**
 * Lightweight, dependency-free password strength scoring.
 * (UI/UX remediation) - Register.jsx previously only showed a
 * static "At least 8 characters" hint with no live feedback while typing.
 *
 * This intentionally stays simple (length + character variety) rather than
 * pulling in a scoring library - it's meant to nudge buyers/sellers toward
 * a stronger password, not to be a rigorous entropy calculator.
 *
 * Returns a score from 0-3:
 *   0 = empty / too short to score
 *   1 = weak
 *   2 = fair
 *   3 = strong
 */
export function getPasswordStrength(password = "") {
    if (!password) {
        return { score: 0, label: "empty" };
    }

    let variety = 0;
    if (/[a-z]/.test(password)) variety += 1;
    if (/[A-Z]/.test(password)) variety += 1;
    if (/[0-9]/.test(password)) variety += 1;
    if (/[^A-Za-z0-9]/.test(password)) variety += 1;

    const lengthScore = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;
    const varietyScore = variety >= 3 ? 2 : variety >= 2 ? 1 : 0;

    const raw = lengthScore + varietyScore;

    if (password.length < 8) {
        return { score: 1, label: "weak" };
    }
    if (raw >= 3) {
        return { score: 3, label: "strong" };
    }
    if (raw >= 2) {
        return { score: 2, label: "fair" };
    }
    return { score: 1, label: "weak" };
}
