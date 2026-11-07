// Client-side mirror of backend/src/utils/username.js (round 5, phase 6).
// This only gives instant feedback while typing - the server is the one that
// actually enforces the rules (format, reserved words, blocklist, uniqueness).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;

export const isValidUsernameFormat = (value) => {
    const username = String(value ?? "").trim();
    return username.length >= USERNAME_MIN && username.length <= USERNAME_MAX && USERNAME_PATTERN.test(username);
};

// "Amina" + "482" -> "amina482". Letters only from the first name, "user"
// when there aren't enough of them.
export const suggestUsername = (firstName, digits) => {
    const letters = String(firstName ?? "").replace(/[^A-Za-z]/g, "").toLowerCase().slice(0, 10);
    const base = letters.length >= 2 ? letters : "user";
    return `${base}${digits}`;
};

export const randomSuggestionDigits = () => String(Math.floor(100 + Math.random() * 900));

// What to show for a person in a public place. Falls back to a neutral label
// (never a real name) if an account somehow has no username.
export const publicName = (person, fallback = "NEXORA buyer") => person?.username || fallback;
