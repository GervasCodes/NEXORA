const db = require("../../config/db");
const generateToken = require("../../utils/generateToken");
const hashPassword = require("../../utils/hashPassword");
const { uploadPrivateDocument } = require("../../utils/privateDocuments");
const appError = require("../../utils/appError");

const userRepository = require("./auth.repository");
const referralService = require("../referral/referral.service");
const usernameService = require("../account/username.service");
const googleService = require("./google.service");

// Roles that must submit verification documents before an account can be
// created at all - see requireApprovedSeller / requireApprovedDeliveryAgent
// for where this gate is enforced on the API.
const VERIFICATION_REQUIRED_ROLES = ["seller", "delivery_agent"];

// Bump this when the Terms of Service / Privacy Policy change in a way
// that requires re-consent. Not enforced retroactively on existing users
// yet (that would need a "please re-accept" gate on login) - this just
// makes each new registration's acceptance traceable to a specific
// version of the documents.
const { REGISTRATION_TERMS_VERSION: CURRENT_TERMS_VERSION } = require("../../config/termsVersions");

// Every role in VERIFICATION_REQUIRED_ROLES needs an owner photo/selfie
// plus at least one government ID. Delivery agents additionally need a
// driver's license. Kept as a lookup so adding a future verified role is
// a one-line change here, not a rewrite of register().
const REQUIRED_DOCS_BY_ROLE = {
    seller: { anyOf: [], oneOf: ["national_id", "voter_id"], required: ["owner_photo"] },
    delivery_agent: { anyOf: [], oneOf: ["national_id", "voter_id"], required: ["owner_photo", "drivers_license"] }
};

// Pulls the first uploaded file out of a multer `.fields()` req.files
// object for a given field name, or undefined if none was sent.
const firstFile = (files, field) => files?.[field]?.[0];

exports.register = async (userData, files = {}) => {
    // Round 5, phase 7: a seller / delivery agent can prefill name + email from
    // Google. The verified email comes from the signed ticket (the body's email
    // is ignored), the account is tied to that Google id, and every document
    // upload below still applies exactly as for a normal registration.
    let googleLink = null;
    if (userData.google_ticket) {
        googleLink = await googleService.resolveRegisterTicket(userData.google_ticket);
        userData = { ...userData, email: googleLink.email };
    }

    const { email, phone, password, role, terms_accepted } = userData;

    // Belt-and-suspenders: auth.validator.js already rejects this at the
    // HTTP layer, but the service shouldn't trust that every caller goes
    // through that middleware (e.g. a future internal/admin-created
    // account path).
    if (terms_accepted !== true && terms_accepted !== "true") {
        throw appError("TERMS_NOT_ACCEPTED", 400);
    }

    // Delivery agents must register with their vehicle info; every other
    // role never sends these fields, so createUser stores them as NULL.
    // (auth.validator.js already enforces both are present when
    // role === "delivery_agent" before this point is ever reached.)

    // Check email
    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) {
        throw new Error("Email already exists");
    }

    // Check phone
    const existingPhone = await userRepository.findByPhone(phone);
    if (existingPhone) {
        throw new Error("Phone number already exists");
    }

    // Username (round 5, phase 6): validate a chosen one, or generate one when
    // the client didn't send it. Done before any document upload so a taken or
    // reserved name costs nothing. The unique index is the final guard against
    // two people picking the same name at the same moment (see the catch below).
    const username = userData.username
        ? await usernameService.assertUsable(userData.username)
        : await usernameService.generateUnique(userData.first_name);

    // A business-tools-only seller never lists publicly, so it skips the
    // marketplace identity review; it can submit documents later if it
    // converts to a marketplace seller (businessTools.service.js).
    const sellerMode = role === "seller" && userData.seller_mode === "business_tools" ? "business_tools" : "marketplace";
    const needsVerification = VERIFICATION_REQUIRED_ROLES.includes(role) && sellerMode !== "business_tools";
    const documentsToUpload = [];

    if (needsVerification) {
        const rules = REQUIRED_DOCS_BY_ROLE[role];

        for (const field of rules.required) {
            const file = firstFile(files, field);
            if (!file) {
                throw new Error(`Please upload your ${field.replace("_", " ")}.`);
            }
            documentsToUpload.push({ type: field, file });
        }

        if (rules.oneOf?.length) {
            const provided = rules.oneOf.filter((field) => firstFile(files, field));
            if (provided.length === 0) {
                throw new Error(
                    `Please upload one of the following: ${rules.oneOf.join(" or ")}.`
                );
            }
            // If both a national ID and a voter ID were provided, keep
            // both - no harm in it - but at least one is mandatory.
            for (const field of provided) {
                documentsToUpload.push({ type: field, file: firstFile(files, field) });
            }
        }
    }

    // Upload every document to Cloudinary BEFORE touching the database at
    // all. If any single upload fails, we throw here and NOTHING has been
    // written - no user row, no profile, nothing - which is what "the
    // account should not be created until all required documents are
    // uploaded and validated" means in practice.
    const uploaded = [];
    for (const doc of documentsToUpload) {
        try {
            const stored = await uploadPrivateDocument(doc.file.buffer, `verification/${doc.type}`);
            uploaded.push({ type: doc.type, stored });
        } catch (uploadError) {
            throw new Error(
                `We couldn't upload your ${doc.type.replace("_", " ")}. Please try again.`
            );
        }
    }

    const hashedPassword = googleLink
        ? await googleService.randomUnusablePasswordHash()
        : await hashPassword(password);

    // Everything from here down happens in one transaction: the user row,
    // the verification documents, and the history entry are all created
    // together or not at all.
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const userId = await userRepository.createUser(
            {
                ...userData,
                username,
                seller_mode: sellerMode,
                password: hashedPassword,
                terms_version: CURRENT_TERMS_VERSION,
                google_sub: googleLink ? googleLink.sub : null,
                auth_provider: googleLink ? "google" : "password"
            },
            connection
        );

        if (needsVerification) {
            for (const doc of uploaded) {
                await userRepository.insertVerificationDocument(userId, doc.type, doc.stored, connection);
            }
            await userRepository.insertVerificationHistory(userId, "submitted", null, null, connection);
        }

        // Referral & loyalty assigns this new user their own
        // referral code, and links them to whoever referred them (if
        // userData.referral_code was submitted and is valid). Both parts
        // happen in this same transaction, so a referral link is never
        // recorded for a user row that didn't actually get created.
        await referralService.setupNewUserReferral(userId, userData.referral_code, connection);

        await connection.commit();

        const token = generateToken({ id: userId, role, language: userData.language || "en" });

        return {
            userId,
            token,
            account_verification_status: needsVerification ? "pending" : "not_required"
        };
    } catch (error) {
        await connection.rollback();
        if (usernameService.isDuplicateUsernameError(error)) {
            throw appError("USERNAME_TAKEN", 409);
        }
        throw error;
    } finally {
        connection.release();
    }
};
