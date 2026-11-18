-- Qbooks Media Hub V2: additive and reversible routing metadata.
-- Existing rows default to R2, unchanged and never migrated implicitly.
ALTER TABLE uploads ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'R2' CHECK(storage_backend IN ('R2','DRIVE'));
CREATE INDEX IF NOT EXISTS idx_uploads_backend_status ON uploads(storage_backend,status);
