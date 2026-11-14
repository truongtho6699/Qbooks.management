-- QBOOK video V2.1: approval gate and immutable production events.
-- Existing video statuses/records and all shipping tables remain untouched.
ALTER TABLE video_items ADD COLUMN review_status TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE video_items ADD COLUMN reviewed_by TEXT;
ALTER TABLE video_items ADD COLUMN reviewed_at TEXT;
ALTER TABLE video_items ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS video_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL REFERENCES video_items(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('FILM_COMPLETED','EDIT_SUBMITTED','REVIEW_APPROVED','REVIEW_REJECTED','PUBLISHED')),
  event_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_video_events_type_day ON video_events(event_type,event_time);
CREATE INDEX IF NOT EXISTS idx_video_events_video ON video_events(video_id,event_time);
