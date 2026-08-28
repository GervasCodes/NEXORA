-- Migration 091: user profile photo (Phase 4 - Real Imagery & Avatars).
--
-- Design notes:
--  - Avatar.jsx (see its own header comment) has supported a `src` prop
--    since it was introduced, but every call site has always passed
--    none, because no photo_url/avatar_url column existed anywhere on
--    users - this is that column. Nullable, no default: existing users
--    (and any account that never uploads a photo) simply keep falling
--    back to Avatar's initials-on-gradient rendering, exactly as today.
--  - One shared column on users, not a role-specific table, because the
--    upload is wired identically for buyers, sellers, and delivery
--    agents (see account.routes.js#POST /account/photo) - there's
--    nothing role-specific about "a photo of this person".
--  - VARCHAR(500) to match every other *_url column already on this
--    table/schema (store_logo, store_banner, file_url, etc.).
ALTER TABLE users
    ADD COLUMN photo_url VARCHAR(500) NULL AFTER phone;
