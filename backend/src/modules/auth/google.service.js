const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const db = require("../../config/db");
const appError = require("../../utils/appError");
const hashPassword = require("../../utils/hashPassword");
const { generateShortLivedToken, verifyShortLivedToken } = require("../../utils/shortLivedToken");
const userRepository = require("./auth.repository");
const loginService = require("./login.service");
const usernameService = require("../account/username.service");
const referralService = require("../referral/referral.service");

// Round 5, phase 7: Google sign-in / sign-up.
//
// The browser (Google Identity Services) hands the frontend a signed ID token.
// We verify it here against GOOGLE_CLIENT_ID - signature, expiry and audience -
// and only ever trust the claims from that verified payload.

const SIGNUP_TICKET_TYP = "google_signup";
const SIGNUP_TICKET_EXPIRY = "15m";

// Same constant auth.service.js stamps on normal registrations.
const CURRENT_TERMS_VERSION = "2026-07-19";

let client = null;
const getClient = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw appError("GOOGLE_NOT_CONFIGURED", 503);
    if (!client || client._nexoraClientId !== clientId) {
        client = new OAuth2Client(clientId);
        client._nexoraClientId = clientId;
    }
    return { client, clientId };
};

// Verified claims, or GOOGLE_TOKEN_INVALID. `email_verified` is Google's own
// statement about the address and decides whether we may link or create.
exports.verifyIdToken = async (idToken) => {
    if (typeof idToken !== "string" || !idToken) throw appError("GOOGLE_TOKEN_INVALID", 401);

    const { client: oauth, clientId } = getClient();
    let payload;
    try {
        const ticket = await oauth.verifyIdToken({ idToken, audience: clientId });
        payload = ticket.getPayload();
    } catch (error) {
        throw appError("GOOGLE_TOKEN_INVALID", 401);
    }

    if (!payload?.sub || !payload.email) throw appError("GOOGLE_TOKEN_INVALID", 401);

    return {
        sub: String(payload.sub),
        email: String(payload.email).trim().toLowerCase(),
        emailVerified: payload.email_verified === true || payload.email_verified === "true",
        firstName: String(payload.given_name || "").trim(),
        lastName: String(payload.family_name || "").trim(),
        picture: payload.picture || null
    };
};

const profileFrom = (claims) => ({
    first_name: claims.firstName,
    last_name: claims.lastName,
    email: claims.email,
    picture: claims.picture
});

const signupTicketFor = (claims) => generateShortLivedToken(
    SIGNUP_TICKET_TYP,
    { sub: claims.sub, email: claims.email, first_name: claims.firstName, last_name: claims.lastName },
    SIGNUP_TICKET_EXPIRY
);

// The ticket proves "Google verified this email for this sub" for a short time.
exports.verifySignupTicket = (ticket) => {
    try {
        return verifyShortLivedToken(SIGNUP_TICKET_TYP, ticket);
    } catch (error) {
        throw appError("GOOGLE_TICKET_INVALID", 401);
    }
};

// One tap: returns { status: "signed_in", user, token } for a known Google user
// (linking an existing email first when Google vouches for it) or
// { status: "needs_profile", ticket, profile } for a brand-new one.
exports.signIn = async (idToken) => {
    const claims = await exports.verifyIdToken(idToken);

    // 1. Already linked: sign in. Suspension/deleted/lockout rules still apply.
    const linked = await userRepository.findByGoogleSub(claims.sub);
    if (linked) {
        loginService.assertCanSignIn(linked);
        return { status: "signed_in", ...loginService.buildSession(linked), userId: linked.id, linked: false };
    }

    // Everything below depends on Google vouching for the address.
    if (!claims.emailVerified) throw appError("GOOGLE_EMAIL_UNVERIFIED", 403);

    // 2. Existing NEXORA account with this email: link, only because Google
    //    reports the email as verified (checked above). An account already
    //    tied to a different Google id is never re-pointed.
    const existing = await userRepository.findByEmail(claims.email);
    if (existing) {
        if (existing.google_sub && existing.google_sub !== claims.sub) {
            throw appError("GOOGLE_ACCOUNT_CONFLICT", 409);
        }
        loginService.assertCanSignIn(existing);
        await userRepository.linkGoogleSub(existing.id, claims.sub);
        return { status: "signed_in", ...loginService.buildSession(existing), userId: existing.id, linked: true };
    }

    // 3. New person: nothing is created until they confirm phone/username/terms.
    return { status: "needs_profile", ticket: signupTicketFor(claims), profile: profileFrom(claims) };
};

// Seller / delivery-agent registration: Google only prefills name + email.
// Nothing is created or linked here; the returned ticket is sent back with the
// normal /auth/register request (which still requires the documents).
exports.prefill = async (idToken) => {
    const claims = await exports.verifyIdToken(idToken);
    if (!claims.emailVerified) throw appError("GOOGLE_EMAIL_UNVERIFIED", 403);

    const existing = (await userRepository.findByGoogleSub(claims.sub)) || (await userRepository.findByEmail(claims.email));
    if (existing) throw appError("GOOGLE_ACCOUNT_EXISTS", 409);

    return { status: "prefill", ticket: signupTicketFor(claims), profile: profileFrom(claims) };
};

// Finishes a new Google signup: always a BUYER account, random unusable
// password, terms recorded with the current version, referral handled.
exports.complete = async ({ ticket, phone, username, terms_accepted, referral_code }) => {
    const claims = exports.verifySignupTicket(ticket);

    if (terms_accepted !== true && terms_accepted !== "true") {
        throw appError("TERMS_NOT_ACCEPTED", 400);
    }

    // The ticket is short-lived but not single-use; re-check nothing was created meanwhile.
    if (await userRepository.findByGoogleSub(claims.sub)) throw appError("GOOGLE_ACCOUNT_EXISTS", 409);
    if (await userRepository.findByEmail(claims.email)) throw new Error("Email already exists");
    if (await userRepository.findByPhone(phone)) throw new Error("Phone number already exists");

    const chosenUsername = username
        ? await usernameService.assertUsable(username)
        : await usernameService.generateUnique(claims.first_name);

    const firstName = claims.first_name || chosenUsername;
    const lastName = claims.last_name || "-";
    // Nobody knows this password; the account signs in through Google, or sets
    // a real password later through the email-code reset.
    const unusablePassword = await hashPassword(crypto.randomBytes(32).toString("hex"));

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const userId = await userRepository.createUser({
            first_name: firstName,
            last_name: lastName,
            email: claims.email,
            phone,
            password: unusablePassword,
            role: "buyer",
            terms_version: CURRENT_TERMS_VERSION,
            seller_mode: "marketplace",
            username: chosenUsername,
            google_sub: claims.sub,
            auth_provider: "google"
        }, connection);

        await referralService.setupNewUserReferral(userId, referral_code, connection);

        await connection.commit();

        const user = await userRepository.findById(userId);
        return { status: "signed_in", ...loginService.buildSession(user), userId };
    } catch (error) {
        await connection.rollback();
        if (usernameService.isDuplicateUsernameError(error)) throw appError("USERNAME_TAKEN", 409);
        if (error?.code === "ER_DUP_ENTRY" && /google_sub/i.test(String(error.sqlMessage || ""))) {
            throw appError("GOOGLE_ACCOUNT_EXISTS", 409);
        }
        throw error;
    } finally {
        connection.release();
    }
};

// Used by auth.service.js#register when a seller / delivery agent registers
// with a Google prefill ticket: the email is the one Google verified (never the
// one in the request body) and the account is tied to that Google id.
exports.resolveRegisterTicket = async (ticket) => {
    const claims = exports.verifySignupTicket(ticket);
    if (await userRepository.findByGoogleSub(claims.sub)) throw appError("GOOGLE_ACCOUNT_EXISTS", 409);
    return { sub: claims.sub, email: claims.email };
};

exports.randomUnusablePasswordHash = async () => hashPassword(crypto.randomBytes(32).toString("hex"));
