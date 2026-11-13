-- QBOOK Video Manager: indexed curriculum catalog imported from approved Google Sheets.
-- Only new video-specific objects; leaves packing/shipping and existing videos untouched.
CREATE TABLE IF NOT EXISTS video_lessons (
 id TEXT PRIMARY KEY,
 book_code TEXT NOT NULL REFERENCES video_books(code),
 week TEXT NOT NULL DEFAULT '',
 lesson_no TEXT NOT NULL DEFAULT '',
 period TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL,
 page TEXT NOT NULL DEFAULT '',
 source_ref TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_video_lessons_book_week ON video_lessons(book_code,week,lesson_no);
