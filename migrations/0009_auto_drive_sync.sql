-- Automatic R2 -> Google Drive sync jobs. Data and files remain untouched.
ALTER TABLE uploads ADD COLUMN auto_lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN auto_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN auto_next_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN auto_error TEXT NOT NULL DEFAULT '';
ALTER TABLE uploads ADD COLUMN auto_last_attempt_at TEXT;
CREATE INDEX IF NOT EXISTS idx_uploads_auto_queue
  ON uploads(status,auto_next_attempt,auto_lease_until);
CREATE TABLE IF NOT EXISTS drive_sync_runs (
 id TEXT PRIMARY KEY,
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at TEXT,
 status TEXT NOT NULL,
 processed_files INTEGER NOT NULL DEFAULT 0,
 completed_files INTEGER NOT NULL DEFAULT 0,
 failed_files INTEGER NOT NULL DEFAULT 0,
 notes TEXT NOT NULL DEFAULT ''
);
