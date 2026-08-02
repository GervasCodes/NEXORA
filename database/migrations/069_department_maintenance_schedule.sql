-- Migration 069: Scheduled maintenance windows for departments.
--
-- Migration 068 gave departments an instant on/off switch plus a custom
-- maintenance_message, but every transition had to be triggered by an
-- admin clicking a button at the exact moment they wanted it to happen.
-- This adds an optional start/end window so an admin can schedule a
-- department to go into maintenance at a future time and come back out
-- of it automatically, without needing to be online for either edge.
--
-- Deliberately scoped to `categories` (departments) only, not
-- service_categories or platform_modules - see
-- jobs/departmentMaintenanceSchedule.job.js and
-- modules/category/category.service.js for the scheduling logic that
-- reads these columns.
ALTER TABLE categories
    ADD COLUMN maintenance_scheduled_start DATETIME NULL AFTER maintenance_message,
    ADD COLUMN maintenance_scheduled_end DATETIME NULL AFTER maintenance_scheduled_start;

-- Lets the every-minute cron job find due transitions with a plain
-- index scan instead of a full table scan - `categories` is small today,
-- but the query runs every 60s indefinitely.
CREATE INDEX idx_categories_maintenance_schedule
    ON categories (maintenance_scheduled_start, maintenance_scheduled_end);
