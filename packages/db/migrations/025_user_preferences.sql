-- =====================================================================
-- 025_user_preferences.sql
-- Add JSONB preferences column to app_users for persisting user settings
-- (notifications, data management, schedule preferences)
-- =====================================================================

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app_users.preferences IS
'User preferences stored as JSONB: notifications (email, desktop, careGaps, riskScores), data (autoRefresh, dailyBackup, compression), schedule (etl, reports)';
