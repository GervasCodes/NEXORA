const db = require("../../config/db");

exports.findById = async (userId) => {
    const [rows] = await db.query(
        `SELECT id, first_name, last_name, email, phone, photo_url, role, admin_level,
                account_verification_status, account_verification_rejection_reason,
                account_verification_submitted_at, account_verification_reviewed_at,
                language, theme, currency, is_active, created_at,
                vehicle_type, vehicle_plate_number, whatsapp_order_updates, data_saver_enabled,
                notify_order_updates, notify_messages, notify_price_stock_alerts, notify_store_updates,
                referral_code, loyalty_points, business_account_status,
                location_sharing_enabled
        FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0];
};

exports.findAuthById = async (userId) => {
    const [rows] = await db.query("SELECT id, password FROM users WHERE id = ?", [userId]);
    return rows[0];
};

exports.findByEmailExcluding = async (email, userId) => {
    const [rows] = await db.query(
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [email, userId]
    );
    return rows[0];
};

exports.findByPhoneExcluding = async (phone, userId) => {
    const [rows] = await db.query(
        "SELECT id FROM users WHERE phone = ? AND id != ?",
        [phone, userId]
    );
    return rows[0];
};

exports.updateProfile = async (userId, data) => {
    const fields = [];
    const params = [];

    const allowed = ["first_name", "last_name", "email", "phone"];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
};

// (Real Imagery & Avatars): deliberately separate from
// updateProfile's allowlist above - the photo is set from the dedicated
// upload endpoint (see account.service.js#uploadProfilePhoto), never
// from the free-text profile form, mirroring how
// seller.repository.js#updateLogo/updateBanner stay separate from
// updateSellerProfile.
exports.updatePhotoUrl = async (userId, photoUrl) => {
    await db.query(
        "UPDATE users SET photo_url = ? WHERE id = ?",
        [photoUrl, userId]
    );
};

// Phase 6 (profile photo delete) - separate from updatePhotoUrl above
// only in that it always writes NULL, never a caller-supplied value;
// kept as its own function rather than reusing updatePhotoUrl(userId,
// null) so callers/tests can see "delete" and "set" as distinct intents
// where they show up in mocks/assertions.
exports.deletePhotoUrl = async (userId) => {
    await db.query(
        "UPDATE users SET photo_url = NULL WHERE id = ?",
        [userId]
    );
};

exports.updateSettings = async (userId, { language, theme, currency, dataSaverEnabled, notifyOrderUpdates, notifyMessages, notifyPriceStockAlerts, notifyStoreUpdates, locationSharingEnabled }) => {
    const fields = [];
    const params = [];

    if (language !== undefined) { fields.push("language = ?"); params.push(language); }
    if (theme !== undefined) { fields.push("theme = ?"); params.push(theme); }
    if (currency !== undefined) { fields.push("currency = ?"); params.push(currency); }
    if (dataSaverEnabled !== undefined) { fields.push("data_saver_enabled = ?"); params.push(dataSaverEnabled ? 1 : 0); }
    // (UI/UX remediation) - notification preferences, same
    // "field present in the payload -> included in the UPDATE, absent
    // -> left untouched" pattern the fields above already use.
    if (notifyOrderUpdates !== undefined) { fields.push("notify_order_updates = ?"); params.push(notifyOrderUpdates ? 1 : 0); }
    if (notifyMessages !== undefined) { fields.push("notify_messages = ?"); params.push(notifyMessages ? 1 : 0); }
    if (notifyPriceStockAlerts !== undefined) { fields.push("notify_price_stock_alerts = ?"); params.push(notifyPriceStockAlerts ? 1 : 0); }
    if (notifyStoreUpdates !== undefined) { fields.push("notify_store_updates = ?"); params.push(notifyStoreUpdates ? 1 : 0); }

    // Phase 5 (map showing users) - opt-out toggle. Turning it off also
    // clears any last-known position in the same UPDATE: without this,
    // a user who opts out would still show up on the admin map at their
    // last recorded spot until it happened to get overwritten (it never
    // would, since a client stops pinging once its own toggle reads
    // false) - the whole point of turning it off is to disappear from
    // the map immediately, not just to stop updating.
    if (locationSharingEnabled !== undefined) {
        fields.push("location_sharing_enabled = ?");
        params.push(locationSharingEnabled ? 1 : 0);
        if (!locationSharingEnabled) {
            fields.push("location_lat = NULL", "location_lng = NULL", "location_lat_updated_at = NULL");
        }
    }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
};

// Phase 5 (map showing users) - records a buyer/seller's live position
// from a socket ping. The `location_sharing_enabled = 1` guard is done
// here, in the same UPDATE, rather than as a separate SELECT-then-write
// in the service layer: that would leave a window where the toggle
// flips to off between the check and the write, letting one more
// position slip through after the user has already opted out. A single
// guarded UPDATE closes that window - either the row is currently
// opted in and gets written, or it isn't and nothing happens.
// affectedRows tells the caller (socket.js) whether to actually
// broadcast the new position, so an opted-out or role-mismatched
// account's ping is silently dropped rather than half-applied.
exports.updateLocation = async (userId, lat, lng) => {
    const [result] = await db.query(
        `UPDATE users
         SET location_lat = ?, location_lng = ?, location_lat_updated_at = NOW()
         WHERE id = ? AND location_sharing_enabled = 1 AND role IN ('buyer', 'seller')`,
        [lat, lng, userId]
    );
    return result.affectedRows > 0;
};

exports.updatePassword = async (userId, hashedPassword) => {
    // token_version bump invalidates every session token issued before
    // this password change - see migration 071 and auth.middleware.js.
    await db.query(
        "UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?",
        [hashedPassword, userId]
    );
};

// --- Account deletion (soft delete) ---
// This is the *soft* delete step: it locks the account and clears out
// genuinely ephemeral/session data, but deliberately leaves the user's
// name, email, phone, and seller profile untouched, so an admin can still
// see who the account belonged to in the Deleted Accounts section before
// deciding to permanently remove it. Scrubbing/erasing that identifying
// data, plus deleting related records, documents, and Cloudinary assets,
// is (Permanent Account Removal)'s job - not this one.
exports.deleteCartItems = async (userId, executor = db) => {
    await executor.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
};

exports.deletePushSubscriptions = async (userId, executor = db) => {
    await executor.query("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
};

// A deleted seller shouldn't keep an active-looking storefront up for
// buyers to browse and buy from while the account can no longer log in
// to manage it - so their listings are taken down the same way an
// admin-moderated listing would be (products.is_active). Harmless no-op
// for buyer/delivery_agent accounts, which have no rows here.
exports.deactivateSellerListings = async (userId, executor = db) => {
    await executor.query("UPDATE products SET is_active = FALSE WHERE seller_id = ?", [userId]);
};

// Marks the account deleted and locks it out (reusing the same is_active
// gate login.service.js/auth.middleware.js already check on every
// login/request), and randomizes the password hash so the old password
// can never be used again even if is_active were ever flipped back by
// mistake. Name/email/phone are intentionally left as-is - see the
// module comment above.
exports.softDeleteUser = async (userId, hashedRandomPassword, executor = db) => {
    await executor.query(
        `UPDATE users
        SET is_active = FALSE, deleted_at = NOW(), password = ?
        WHERE id = ?`,
        [hashedRandomPassword, userId]
    );
};
