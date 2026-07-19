-- Migration 036: terms acceptance
-- Registration previously had no recorded, explicit consent to the
-- Terms of Service / Privacy Policy - only a footer link. This adds a
-- timestamped acceptance so consent is an auditable fact per user
-- rather than implied by having an account at all.
--
-- terms_version lets a future re-acceptance flow be added later
-- (bump CURRENT_TERMS_VERSION in auth.service.js and prompt any user
-- whose terms_version is behind it) without another migration.

ALTER TABLE users
    ADD COLUMN terms_accepted_at TIMESTAMP NULL DEFAULT NULL AFTER is_active,
    ADD COLUMN terms_version VARCHAR(20) NULL DEFAULT NULL AFTER terms_accepted_at;
