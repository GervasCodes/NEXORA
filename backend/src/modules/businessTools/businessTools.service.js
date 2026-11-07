const db = require("../../config/db");
const authRepository = require("../auth/auth.repository");
const { uploadPrivateDocument } = require("../../utils/privateDocuments");

// Converting a business-tools-only account into a full marketplace seller.
//
// It is the SAME user row: only seller_mode flips and the account enters
// the normal seller identity review (same documents the marketplace
// sign-up asks for). Nothing POS-related moves or is rewritten - the stock
// ledger, off-platform sales and items are all keyed to the user id - so
// history is preserved by construction. Items stay inactive until the
// seller publishes them after approval and store setup.

const fail = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const firstFile = (files, field) => files?.[field]?.[0];

exports.convertToMarketplace = async (userId, files = {}) => {
    const user = await authRepository.findById(userId);
    if (!user) throw fail("Account not found.", 401);
    if (user.role !== "seller" || user.seller_mode !== "business_tools") {
        throw fail("Only a business tools account can be upgraded to a marketplace seller.");
    }

    // Same document rules as marketplace seller registration.
    const documents = [];
    const ownerPhoto = firstFile(files, "owner_photo");
    if (!ownerPhoto) throw fail("Please upload your owner photo.");
    documents.push({ type: "owner_photo", file: ownerPhoto });

    const ids = ["national_id", "voter_id"].filter((field) => firstFile(files, field));
    if (ids.length === 0) throw fail("Please upload one of the following: national_id or voter_id.");
    ids.forEach((field) => documents.push({ type: field, file: firstFile(files, field) }));

    // Upload before touching the database, so a failed upload changes nothing.
    const uploaded = [];
    for (const doc of documents) {
        try {
            const stored = await uploadPrivateDocument(doc.file.buffer, `verification/${doc.type}`);
            uploaded.push({ type: doc.type, stored });
        } catch (uploadError) {
            throw fail(`We couldn't upload your ${doc.type.replace("_", " ")}. Please try again.`);
        }
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Conditional flip: a double-submit or second tab changes nothing the
        // second time, and can't submit documents twice.
        const [result] = await connection.query(
            `UPDATE users
             SET seller_mode = 'marketplace',
                 account_verification_status = 'pending',
                 account_verification_submitted_at = NOW()
             WHERE id = ? AND role = 'seller' AND seller_mode = 'business_tools'`,
            [userId]
        );
        if (result.affectedRows === 0) {
            throw fail("This account has already been upgraded.");
        }

        for (const doc of uploaded) {
            await authRepository.insertVerificationDocument(userId, doc.type, doc.stored, connection);
        }
        await authRepository.insertVerificationHistory(userId, "submitted", null, null, connection);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    const updated = await authRepository.findById(userId);
    delete updated.password;
    return updated;
};
