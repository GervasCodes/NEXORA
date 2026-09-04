-- Migration 099: Phase 9 (UI/UX remediation) - live selling reminders
-- Run after 098_conversation_mute_archive.sql.
--
-- One row per buyer who tapped "notify me" on a scheduled session.
-- notified_at follows the exact same "mark it fired, don't delete the
-- row" reasoning migration 096's product_alerts table already
-- established (see that migration's comment) - kept for the same
-- debuggability reason, cleanup being a separate housekeeping concern.
--
-- Deliberately does not add a replay/recording column to
-- live_selling_sessions: this platform stores nothing about a session
-- beyond an external link and a status, so there is no data source for
-- a "past sessions with replay" view - the plan this phase came from
-- explicitly says to skip building UI for something the data can't
-- support rather than fake it, and that applies here at the schema
-- level too, not just the UI level.
CREATE TABLE IF NOT EXISTS live_selling_reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_id INT NOT NULL,
    notified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_live_selling_reminders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_live_selling_reminders_session FOREIGN KEY (session_id) REFERENCES live_selling_sessions(id) ON DELETE CASCADE,
    CONSTRAINT uq_live_selling_reminders_pair UNIQUE (user_id, session_id),
    INDEX idx_live_selling_reminders_session (session_id, notified_at)
);
