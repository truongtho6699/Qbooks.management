-- QBOOK: per-user, per-menu allow/deny with default deny for VIEW accounts.
-- These grants control visibility and are also checked at API gates.
CREATE TABLE IF NOT EXISTS user_menu_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_key TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0 CHECK(allowed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,menu_key)
);
CREATE INDEX IF NOT EXISTS idx_menu_permission_key ON user_menu_permissions(menu_key,user_id);
-- Protect locally-entered orders against duplicate invoice codes.
-- The legacy source has already been checked for existing normalized duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_invoice_normalized ON orders(UPPER(TRIM(invoice_codes)));
