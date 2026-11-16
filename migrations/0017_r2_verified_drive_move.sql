-- QBOOK R2 -> Drive verified move. Non-destructive schema migration.
-- Historical uploads are not automatically deleted: drive_verified_at starts NULL.
ALTER TABLE uploads ADD COLUMN drive_verified_at TEXT;
ALTER TABLE uploads ADD COLUMN r2_deleted_at TEXT;
ALTER TABLE uploads ADD COLUMN r2_delete_error TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_uploads_r2_cleanup ON uploads(drive_file_id,drive_verified_at,r2_deleted_at);
