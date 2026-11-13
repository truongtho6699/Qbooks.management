-- Link actual video production records to the imported curriculum without touching shipping tables.
ALTER TABLE video_items ADD COLUMN lesson_id TEXT REFERENCES video_lessons(id);
CREATE INDEX IF NOT EXISTS idx_video_item_lesson_id ON video_items(lesson_id);
