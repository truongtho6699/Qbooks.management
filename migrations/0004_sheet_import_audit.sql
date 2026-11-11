-- Additional safe metadata for explicit pull from Google Sheets to D1.
ALTER TABLE orders ADD COLUMN local_dirty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN source_payload TEXT NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN source_creator TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN source_created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN source_packed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN source_shipped_by TEXT NOT NULL DEFAULT '';
