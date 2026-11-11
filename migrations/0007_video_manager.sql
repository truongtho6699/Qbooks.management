-- QBOOK VIDEO MANAGER v1 – separate schema from packing/shipping
CREATE TABLE IF NOT EXISTS video_books (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 teacher TEXT NOT NULL DEFAULT '',
 target_count INTEGER NOT NULL DEFAULT 0,
 drive_url TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS video_items (
 id TEXT PRIMARY KEY,
 book_id TEXT NOT NULL REFERENCES video_books(id),
 title TEXT NOT NULL,
 lesson TEXT NOT NULL DEFAULT '',
 lesson_group TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'CHỜ QUAY' CHECK(status IN ('CHỜ QUAY','ĐÃ QUAY','ĐANG HẬU KỲ','CHỜ DUYỆT','ĐÃ PHÁT HÀNH')),
 camera_id TEXT REFERENCES users(id),
 editor_id TEXT REFERENCES users(id),
 teacher TEXT NOT NULL DEFAULT '',
 raw_url TEXT NOT NULL DEFAULT '',
 output_url TEXT NOT NULL DEFAULT '',
 youtube_url TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 filmed_at TEXT,
 edited_at TEXT,
 published_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_video_items_book ON video_items(book_id,status);
CREATE INDEX IF NOT EXISTS idx_video_items_staff ON video_items(camera_id,editor_id);
CREATE TABLE IF NOT EXISTS video_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL,
 video_id TEXT,
 details TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS video_role_grants (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 can_film INTEGER NOT NULL DEFAULT 0,
 can_edit INTEGER NOT NULL DEFAULT 0,
 can_manage INTEGER NOT NULL DEFAULT 0
);
