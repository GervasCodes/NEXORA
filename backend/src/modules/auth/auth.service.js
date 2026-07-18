const db = require("../../config/db");
const generateToken = require("../../utils/generateToken");
const hashPassword = require("../../utils/hashPassword");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

const userRepository = require("./auth.repository");

// Roles that must submit verification documents before an account can be
// created at all - see requireApprovedSeller / requireApprovedDeliveryAgent
// for where this gate is enforced on the API.
const VERIFICATION_REQUIRED_ROLES = ["seller", "delivery_agent"];

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
    const { email, phone, password, role } = userData;

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

    const needsVerification = VERIFICATION_REQUIRED_ROLES.includes(role);
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
            const result = await uploadToCloudinary(doc.file.buffer, `verification/${doc.type}`, "auto");
            uploaded.push({ type: doc.type, url: result.secure_url });
        } catch (uploadError) {
            throw new Error(
                `We couldn't upload your ${doc.type.replace("_", " ")}. Please try again.`
            );
        }
    }

    const hashedPassword = await hashPassword(password);

    // Everything from here down happens in one transaction: the user row,
    // the verification documents, and the history entry are all created
    // together or not at all.
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const userId = await userRepository.createUser(
            { ...userData, password: hashedPassword },
            connection
        );

        if (needsVerification) {
            for (const doc of uploaded) {
                await userRepository.insertVerificationDocument(userId, doc.type, doc.url, connection);
            }
            await userRepository.insertVerificationHistory(userId, "submitted", null, null, connection);
        }

        await connection.commit();

        const token = generateToken({ id: userId, role });

        return {
            userId,
            token,
            account_verification_status: needsVerification ? "pending" : "not_required"
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
