-- Vai trò VIEW hiệu lực, tương thích bảng users cũ có ràng buộc CHECK 4 vai trò.
-- Không sửa bảng users hoặc các tài khoản đã có.
CREATE TABLE IF NOT EXISTS user_view_roles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
