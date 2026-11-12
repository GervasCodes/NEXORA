/**
 * Single password policy used by registration, password change, password
 * reset and admin creation.
 *
 *  - at least 8 characters
 *  - at most 72 BYTES: bcrypt silently ignores everything after byte 72, so
 *    a longer password would give a false sense of strength and let two
 *    different long passwords match each other
 *  - not a very common password, and not a trivial pattern (one repeated
 *    character, or a plain run such as 12345678 / abcdefgh)
 *
 * Deliberately simple and offline: no complexity rules that push people
 * toward predictable substitutions, and no call to an external breach-check
 * service (that is a separate owner decision, see docs).
 */

const MIN_LENGTH = 8;
const MAX_BYTES = 72;

const COMMON = new Set([
    "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword", "pa$$w0rd",
    "12345678", "123456789", "1234567890", "123123123", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "qazwsxedc",
    "qwertyui", "qwertyuiop", "qwerty123", "qwerty1234", "qwerty12345", "asdfghjk", "asdfghjkl", "zxcvbnm1", "zxcvbnm123",
    "iloveyou", "iloveyou1", "iloveyou123", "admin123", "admin1234", "administrator", "welcome1", "welcome123", "letmein1",
    "letmein123", "monkey123", "dragon123", "football", "football1", "baseball", "sunshine", "princess", "trustno1",
    "superman", "master123", "hello123", "freedom1", "whatever", "abc12345", "abcd1234", "abcd12345", "a1b2c3d4",
    "11111111", "00000000", "88888888", "99999999", "12341234", "87654321", "changeme", "changeme1", "default123",
    "test1234", "testing123", "user1234", "login123", "secret123", "mypassword", "mypassword1", "internet1", "computer1",
    "nexora123", "nexora2026", "nexora@123", "nexoramarketplace", "tanzania", "tanzania1", "tanzania123", "dareslaam",
    "11223344", "12121212", "13131313", "147258369", "159753456", "321654987", "987654321", "999999999", "123456789a",
    "a123456789", "aa123456", "abc123456", "abcdefg1", "asdf1234", "asdfasdf", "baseball1", "basketball", "batman123",
    "charlie1", "chelsea1", "arsenal1", "liverpool", "manchester", "barcelona", "realmadrid", "cristiano7", "messi1010",
    "dragon12", "flower123", "google123", "hunter123", "jordan23", "killer123", "lovely123", "michael1", "ninja123",
    "passw0rd1", "pass1234", "pass12345", "password!", "password2", "q1w2e3r4", "q1w2e3r4t5", "qwer1234", "qwertyuiop1",
    "shadow123", "soccer123", "starwars1", "summer2024", "summer2025", "summer2026", "tigger123", "unknown123", "welcome2026",
    "bongo123", "simba123", "mpesa123", "kenya123", "uganda123", "swahili1", "karibu123", "asante123", "mungu123",
]);

const isRepeatedCharacter = (value) => /^(.)\1+$/.test(value);

const isPlainRun = (value) => {
    if (!/^[a-z0-9]+$/i.test(value)) return false;
    const codes = [...value.toLowerCase()].map((c) => c.charCodeAt(0));
    const step = codes[1] - codes[0];
    return Math.abs(step) === 1 && codes.every((code, i) => i === 0 || code - codes[i - 1] === step);
};

// Returns null when the password is acceptable, otherwise { code, message }.
exports.checkPassword = (password) => {
    if (typeof password !== "string" || password.length < MIN_LENGTH) {
        return { code: "too_short", message: `Password must be at least ${MIN_LENGTH} characters` };
    }
    if (Buffer.byteLength(password, "utf8") > MAX_BYTES) {
        return { code: "too_long", message: `Password is too long (the maximum is ${MAX_BYTES} bytes, about ${MAX_BYTES} characters)` };
    }
    const lowered = password.toLowerCase();
    if (COMMON.has(lowered) || isRepeatedCharacter(password) || isPlainRun(password)) {
        return { code: "too_common", message: "That password is too easy to guess. Choose a less common one" };
    }
    return null;
};

// express-validator helper: .custom(passwordRule) or passwordRule("field").
exports.passwordRule = (value) => {
    const problem = exports.checkPassword(value);
    if (problem) throw new Error(problem.message);
    return true;
};

exports.MIN_LENGTH = MIN_LENGTH;
exports.MAX_BYTES = MAX_BYTES;
