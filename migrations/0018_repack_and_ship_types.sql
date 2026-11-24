-- 2026-11-24: let Sales/Packer send a packed order back for re-packing (re-shoot video,
-- replace photos). Additive columns only; existing rows keep working.
ALTER TABLE orders ADD COLUMN repack_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN repack_stages TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN repack_requested_at TEXT;
ALTER TABLE orders ADD COLUMN repack_requested_by TEXT;
ALTER TABLE orders ADD COLUMN repack_count INTEGER NOT NULL DEFAULT 0;
