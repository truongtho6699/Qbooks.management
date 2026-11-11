PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('ADMIN','SALE','PACKER','SHIPPER')),
 pin_salt TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0,
 google_sub TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
CREATE TABLE IF NOT EXISTS google_registrations (
 google_sub TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REJECTED')),
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_registrations_email ON google_registrations(email);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY,
 invoice_codes TEXT NOT NULL,
 sale_name TEXT NOT NULL,
 customer TEXT NOT NULL,
 quantity INTEGER NOT NULL DEFAULT 0,
 address TEXT NOT NULL DEFAULT '',
 carrier TEXT NOT NULL DEFAULT '',
 transport TEXT NOT NULL DEFAULT '',
 urgent INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'CHỜ ĐÓNG HÀNG' CHECK(status IN ('CHỜ ĐÓNG HÀNG','CHỜ VẬN ĐƠN','ĐANG GIAO','HOÀN THÀNH')),
 group_id TEXT,
 packing_note TEXT NOT NULL DEFAULT '',
 boxes INTEGER NOT NULL DEFAULT 0,
 packed_by TEXT,
 packed_at TEXT,
 shipping_note TEXT NOT NULL DEFAULT '',
 shipped_by TEXT,
 shipped_at TEXT,
 created_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_group ON orders(group_id);
CREATE TABLE IF NOT EXISTS uploads (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 stage TEXT NOT NULL CHECK(stage IN ('ANH_HOA_DON','VIDEO_DONG_HANG','HANG_HOA','GIAO_HANG')),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 content_type TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 upload_id TEXT,
 chunk_size INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'UPLOADING' CHECK(status IN ('UPLOADING','COMPLETE','ABORTED')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT
);
CREATE TABLE IF NOT EXISTS upload_parts (
 upload_id TEXT NOT NULL REFERENCES uploads(id),
 part_number INTEGER NOT NULL,
 etag TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 PRIMARY KEY(upload_id,part_number)
);
CREATE INDEX IF NOT EXISTS idx_uploads_order ON uploads(order_id,status);
CREATE TABLE IF NOT EXISTS shipping_groups (
 id TEXT PRIMARY KEY,
 created_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL,
 order_id TEXT,
 details TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
