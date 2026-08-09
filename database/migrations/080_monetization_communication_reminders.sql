-- Migration 080: Trust & Monetization Communication.
--
-- Adds reminder-tracking columns to monetization_schedule (migration
-- 079) so the monetizationSchedule cron job (jobs/monetizationSchedule.job.js)
-- can send a push-notification reminder to sellers/providers before a
-- scheduled billing change takes effect, without re-sending it on every
-- subsequent minute-tick once it's gone out.
--
-- Two reminder points (3 days out, 1 day out) rather than one, so a
-- seller who missed the first has a second chance before billing
-- actually starts/stops - see monetizationSchedule.service.js#sendDueReminders.
ALTER TABLE monetization_schedule
    ADD COLUMN reminder_3d_sent_at DATETIME NULL AFTER applied_at,
    ADD COLUMN reminder_1d_sent_at DATETIME NULL AFTER reminder_3d_sent_at;
