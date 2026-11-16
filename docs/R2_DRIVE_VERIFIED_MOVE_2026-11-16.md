# QBOOK — R2 → Google Drive tự động, xác minh rồi dọn R2
Cập nhật 16/11/2026.

## Đích lưu trữ đã xác minh
- **Ảnh hóa đơn, ảnh hàng hóa, ảnh bàn giao:** giữ nguyên đường dẫn Drive cũ `DON_HANG/{ID_DON}_{MA_HOA_DON}/DONG_HANG/01_ANH_HOA_DON`, `03_HANG_HOA`, hoặc `GIAO_HANG`. Drive gốc cũ: `18rw-KCkTs0Q8MYABCzYTxfLh_W7pbx83`.
- **Video đóng hàng `VIDEO_DONG_HANG`:** tất cả chuyển vào thư mục Drive [Lưu trữ video](https://drive.google.com/drive/folders/1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N), mã `1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N`. Tên tệp có mã upload duy nhất để tránh trùng.
- Đã đọc metadata thư mục đích bằng Google Drive API, đúng `mimeType=folder`; **chưa xác nhận quyền ghi của tài khoản OAuth chạy Worker**.
- **Phạm vi hiện có:** tệp do Giao hàng → Đóng hàng / Vận đơn đưa vào R2 (`uploads`), không tự đổi luồng Quản lý Media Quay/Hậu kỳ đang tải tệp trực tiếp lên Google Drive. Nếu cần tất cả video Media cũng đi qua R2, cần triển khai thêm luồng Media staging riêng để bảo toàn quy trình.

## Luồng kỹ thuật
```
Nhân viên lưu ảnh / video
    → R2 qbooks-media (COMPLETE)
    → D1 uploads chờ đồng bộ
    → Cron Worker mỗi 5 phút lấy token Google ngoại tuyến
    → Drive resumable upload 8MiB / phần (có resume)
    → Drive trả file ID, D1 ghi drive_file_id
    → ĐỌC LẠI metadata Drive bằng API
    → kiểm tra ID, kích thước, MIME, parent folder, appProperties.qbooksUploadId, tệp không bị trash
    → D1 ghi drive_verified_at
    → nếu SYNC_ENABLED=true và R2_MOVE_ENABLED=true, kiểm tra lại R2 head, xóa tệp R2
    → R2 head xác nhận đã xóa → D1 ghi r2_deleted_at
```

**Không xóa R2 nếu Drive chưa chứng minh đúng tệp, nếu có lỗi quyền/thư mục/dung lượng hoặc khi cấu hình chưa bật.** Lỗi chuyển lưu vào auto_error, Cron thử lại theo lịch. Nếu R2 đã xóa nhưng D1 ghi trạng thái lỗi, lần sau đối chiếu lại Drive rồi cập nhật D1, không xóa tệp khác.

Sau khi R2 được xóa, màn QBOOK trả liên kết mở file trên Google Drive cho nhân viên có quyền, thay vì báo tệp không tồn tại.

## Triển khai đã thực hiện
- GitHub source:
  - `src/sync-google.js`: chuyển hướng video đóng hàng vào thư mục mới
  - `src/r2-drive-move.js`: đối chiếu Drive, kiểm tra và xóa R2 có điều kiện
  - `src/drive-auto-worker.js`: thêm xử lý lưu trữ/xóa và tiếp tục khi có lỗi
  - `src/worker.js` + `public/app.js`: xem link Drive sau khi dọn R2
  - `migrations/0017_r2_verified_drive_move.sql`: nhật ký xác minh/xóa
  - `test/r2-drive-move.test.js`, `test/sync-google.test.js`: hồi quy an toàn
- Migration 0017 đã áp dụng lên D1 Production: **không xóa/chuyển file cũ**.
- Worker `qbooks-drive-auto-sync` đã được cập nhật mã qua Cloudflare API; kết nối D1/R2 và Cron `*/5 * * * *` vẫn giữ nguyên.
- Tạo `scripts/build-drive-worker.mjs`, chạy bằng `npm run build:drive-worker` để đóng gói lại độc lập. Build tạo `dist/qbooks-drive-auto-sync.mjs`; không đưa credential vào GitHub.

## Điều kiện BẮT BUỘC để chạy tự động — chưa hoàn tất
Tại Cloudflare Dashboard → Workers & Pages → `qbooks-drive-auto-sync` → **Settings → Variables and Secrets**:
1. Lưu Secret `GOOGLE_OAUTH_CLIENT_SECRET` là Client Secret của OAuth Web Client thuộc Google Cloud project đang sử dụng.
2. Lưu Secret `GOOGLE_REFRESH_TOKEN`, xin quyền ngoại tuyến `https://www.googleapis.com/auth/drive` bằng đúng tài khoản Google có quyền **thêm tệp** ở cả Drive gốc cũ `DON_HANG` và thư mục `Lưu trữ video`.
3. Kiểm tra `GOOGLE_CLIENT_ID` đúng Web OAuth Client ID.
4. **Chạy thử chỉ sao chép:** đặt `SYNC_ENABLED=true`, giữ `R2_MOVE_ENABLED=false` (vắng biến cũng là false). Kiểm tra file ảnh nhỏ lên đúng thư mục cũ và video lên đúng thư mục `Lưu trữ video`; kiểm tra kích thước, mở file.
5. **Sau khi nghiệm thu bản sao**, đặt `R2_MOVE_ENABLED=true`. Worker sẽ xác minh Drive rồi tự xóa bản R2, ghi trạng thái `r2_deleted_at`.
6. Theo dõi **QBOOK → Quản trị → Đồng bộ** và D1 `drive_sync_runs`, `uploads`. Có lỗi thì đặt `R2_MOVE_ENABLED=false` ngay, giữ `SYNC_ENABLED=true` nếu muốn chỉ sao chép.

**Không gửi Secret hoặc Refresh Token vào ChatGPT, GitHub, trang tính hay tin nhắn.** Khi Google Auth Platform ở trạng thái Testing, Refresh Token quyền Drive có thể hết hạn sớm.

## Trạng thái dữ liệu trước khi bật
Trên D1 có **3 hồ sơ tệp R2 đã COMPLETE, tất cả chưa có drive_file_id**:
| Nhóm | Số tệp | Bytes |
|---|---:|---:|
| Ảnh hóa đơn | 1 | 14.789.747 |
| Ảnh hàng hóa | 1 | 7.506.240 |
| Video đóng hàng | 1 | 579.772.367 |

Worker đang có `SYNC_ENABLED=false` và chưa có hai Secret Google; do đó **chưa tự chuyển tệp hoặc xóa bất kỳ bản gốc R2 nào**. Mã nguồn/kiểm thử hoàn thiện không đồng nghĩa đã nghiệm thu sao chép thật.

## Lưu ý vận hành
- Video 580MB cần nhiều lượt Cron 5 phút vì mỗi lượt xử lý tối đa 5×8MiB; không báo đã đồng bộ trước khi Drive xác nhận.
- Xóa R2 sau khi verified là quyết định lưu trữ dài hạn. Quyền truy cập Drive của nhân viên và thời gian lưu giữ trên Drive phải được quản lý ổn định.
- Bảng `orders`, `uploads`, các trạng thái đơn, dữ liệu Sheet và phân quyền QBOOK không bị ghi đè bởi migration này.
