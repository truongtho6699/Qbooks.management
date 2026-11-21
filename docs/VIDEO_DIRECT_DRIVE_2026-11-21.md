# Video đóng hàng tải thẳng lên Google Drive (21/11/2026)

## Luồng mới

```
Trình duyệt ──POST /api/uploads──▶ Pages Function (kiểm quyền, khóa đơn)
                                     │ dùng GOOGLE_REFRESH_TOKEN mở phiên resumable
                                     │ trong thư mục "Lưu trữ video" (kèm Origin)
◀──────── sessionUrl (chỉ ghi được đúng 1 tệp) ─┘
Trình duyệt ──PUT từng phần 32 MB──▶ www.googleapis.com   (không qua Worker, không qua R2)
Trình duyệt ──POST /api/uploads/{id}/complete──▶ Function hỏi lại Drive: đủ dung lượng,
                                     đúng thư mục, đúng MIME, đúng qbooksUploadId → COMPLETE
```

- Access token Google **không bao giờ** xuống trình duyệt; trình duyệt chỉ nhận URL phiên tải.
- Mất mạng giữa chừng: trình duyệt hỏi Drive đã nhận tới byte nào rồi gửi tiếp. Tải lại trang
  và chọn lại đúng tệp cũng tiếp tục được (mã phiên lưu trong localStorage, phiên Drive sống ~1 tuần).
- Bản ghi D1 có `object_key` bắt đầu bằng `drive:`, `drive_file_id`, `drive_verified_at` và
  `r2_deleted_at` (không có bản R2) nên Cron đồng bộ bỏ qua, nút tải tệp trả liên kết Drive.
- Ảnh vẫn đi R2 và được Cron đồng bộ sang Drive như cũ.

## Bật tính năng

Trong **Cloudflare Pages → qbooks-quantri → Settings → Variables and Secrets** (Production):

| Tên | Loại | Giá trị |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Variable | giống Cron Worker |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Secret | giống Cron Worker |
| `GOOGLE_REFRESH_TOKEN` | Secret | giống Cron Worker (quyền `drive`, có quyền thêm tệp vào "Lưu trữ video") |
| `VIDEO_DIRECT_DRIVE` | Variable | `true` |

Triển khai lại Pages. Thiếu bất kỳ biến nào hoặc `VIDEO_DIRECT_DRIVE` khác `true` → video tự
quay về R2 multipart (tải song song 3 phần) như trước. Muốn tắt khẩn cấp: đặt `VIDEO_DIRECT_DRIVE=false`.

## Nghiệm thu

1. Đóng thử một đơn với video ~100 MB trên điện thoại 4G: thanh tiến độ ghi "đã ghi nhận tại Google Drive".
2. Kiểm tra tệp `QBOOKS_<uploadId>_<tên>` nằm trong thư mục Lưu trữ video, mở xem được.
3. Tắt Wi-Fi giữa chừng rồi bật lại, bấm Lưu: phải tiếp tục từ phần đã gửi, không tải lại từ đầu.
4. Quản trị → Đồng bộ: video mới không nằm trong danh sách chờ đồng bộ.

Lưu ý: dung lượng video tính vào tài khoản Google đứng sau refresh token (nên dùng Workspace/Shared Drive).
