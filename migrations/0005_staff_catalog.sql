-- Danh mục nhân sự V35 dùng chọn người đóng cùng. Không nhập hoặc lưu PIN cột G.
CREATE TABLE IF NOT EXISTS legacy_staff_catalog (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  can_pack INTEGER NOT NULL DEFAULT 0,
  can_ship INTEGER NOT NULL DEFAULT 0,
  can_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_legacy_staff_pack ON legacy_staff_catalog(active,can_pack);
