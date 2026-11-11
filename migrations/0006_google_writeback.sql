-- Google Drive upload sessions and verified mirror locations. No existing media is deleted.
ALTER TABLE uploads ADD COLUMN drive_file_id TEXT;
ALTER TABLE uploads ADD COLUMN drive_folder_url TEXT;
ALTER TABLE uploads ADD COLUMN drive_session_url TEXT;
ALTER TABLE uploads ADD COLUMN drive_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN drive_completed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_uploads_drive_pending ON uploads(status,drive_file_id);
