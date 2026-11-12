# QBOOKS — Đồng bộ tự động ảnh/video R2 → Google Drive

## Đã triển khai 12/11/2026
- Worker: `qbooks-drive-auto-sync` (độc lập QBOOKS Pages)
- Cloudflare Cron Triggers: mỗi 5 phút (`*/5 * * * *`, theo UTC).
- Cloudflare D1: `qbooks-db` — bảng `uploads`, `drive_sync_runs`; migration `0009_auto_drive_sync.sql`.
- R2: `qbooks-media`.
- Nguồn dữ liệu và cấu trúc thư mục: cùng mã `sync-google.js`, Drive gốc `CAU_HINH!B3`.
- Trạng thái bảo mật ban đầu: `SYNC_ENABLED=false`. **Chưa được phép ghi Drive khi chưa có quyền Google dài hạn.**
- Chương trình Đóng hàng / Vận đơn: nhân viên chỉ cần bấm **LƯU**; ảnh và video được lưu R2, tự được phát hiện qua `uploads.status='COMPLETE'`. Không cần đăng nhập Google trong mỗi lần lưu.
- Chương trình admin hiển thị số hồ sơ đang chờ, lịch sử lần chạy, tệp bị lỗi.
- Mỗi lần Cron xử lý tối đa 2 tệp, mỗi tệp tối đa 5 phần 8 MiB. Khi chưa xong sẽ tiếp tục sau 5 phút. Có lease 9 phút để tránh xử lý song song, retry 1,3,10,30,60… phút nếu gặp lỗi. Không xóa R2.
- D1 lưu `drive_file_id`, `drive_folder_url`, `drive_offset`; chỉ khi Google xác nhận đủ dung lượng mới coi là hoàn thành.

## Hành động một lần BẮT BUỘC để kích hoạt Google Drive

Máy chủ không thể tự lấy quyền từ lần nhân viên đăng nhập Google trên trình duyệt. Cần Google OAuth 2.0 **ngoại tuyến** để máy chủ làm việc khi người dùng không mở ứng dụng.

**Không gửi Client Secret hoặc refresh token trong ChatGPT, GitHub, Google Sheets hay bất kỳ màn hình nhật ký nào.**

### A. Chuẩn bị Google Cloud
1. Chọn Google Cloud project number `655888224456`; kiểm tra Client ID ứng dụng web đang dùng QBOOKS.
2. Bật Google Drive API.
3. Trong Google Auth Platform → Data access, khai báo phạm vi `https://www.googleapis.com/auth/drive`.
4. Tài khoản Google được cấp quyền phải có quyền **tạo tệp/thư mục** tại `DON_HANG`, mã `18rw-KCkTs0Q8MYABCzYTxfLh_W7pbx83`.
5. Xem Google Auth Platform → Audience. Nếu ứng dụng External còn Testing, Google refresh token phạm vi Drive thường **hết hạn sau 7 ngày**; cần triển khai theo quy định Google trước khi dùng liên tục.

### B. Lấy refresh token bằng tài khoản chủ sở hữu Drive
1. Tại [Google Cloud Clients](https://console.cloud.google.com/auth/clients?project=655888224456), chọn OAuth client loại **Web application**. Ghi nhận Client Secret vào công cụ quản lý bí mật riêng, không đưa vào mã nguồn.
2. Tạm thêm URL redirect `https://developers.google.com/oauthplayground` trong Authorized redirect URIs cho OAuth client đó.
3. Truy cập [Google OAuth Playground](https://developers.google.com/oauthplayground/). Chọn cấu hình OAuth: **Server-side**, **Offline**, **Use your own OAuth credentials**, điền Client ID và Client Secret trên máy của mình.
4. Chọn đúng phạm vi `https://www.googleapis.com/auth/drive`, bấm Authorize APIs, đăng nhập tài khoản có quyền thư mục.
5. Bấm Exchange authorization code for tokens; sao chép **Refresh Token** vào trình quản lý bí mật của cá nhân.
6. Sau khi hoàn tất có thể bỏ redirect URI Playground nếu không còn dùng; token đã cấp vẫn hợp lệ trừ khi bị thu hồi/hết hạn.

### C. Cấu hình Cloudflare Worker
Mở Cloudflare Dashboard → Workers & Pages → `qbooks-drive-auto-sync` → **Settings → Variables and Secrets**.

Đặt **2 Secret**:
- `GOOGLE_OAUTH_CLIENT_SECRET`: Client Secret Google.
- `GOOGLE_REFRESH_TOKEN`: Refresh Token vừa cấp.

Kiểm tra biến sẵn có `GOOGLE_CLIENT_ID` có giá trị phù hợp.
Sau khi cả hai Secret đã được đặt **và đã kiểm tra quyền thư mục**, đổi biến `SYNC_ENABLED` từ `false` sang `true` và triển khai cấu hình nếu hệ thống yêu cầu.

**Không đổi SYNC_ENABLED=true khi chưa có Secret.** Worker hiện ở trạng thái an toàn, sẽ không thực hiện tác vụ khi thiếu Secret.

### D. Nghiệm thu
1. Trong QBOOKS → Quản trị → Đồng bộ, xác nhận có 3 tệp đang chờ, gồm video `IMG_7145.mov`.
2. Sau khi kích hoạt và qua một lượt Cron, xem `drive_sync_runs` / bảng Quản trị để xác nhận tiến độ.
3. Kiểm tra đúng thư mục và **mở trực tiếp** từng tệp Google Drive; xác thực kích thước bằng Google API.
4. Khi cả ba tệp đã hoàn tất, đối chiếu `uploads.drive_file_id` và tổng số tệp trong Drive.
5. Kiểm thử thêm một ảnh nhỏ và một video mới bằng tài khoản đóng hàng/vận đơn, **chỉ bấm LƯU**.
6. Nếu lỗi quyền, dừng Cron bằng `SYNC_ENABLED=false` trước khi sửa. Không xóa hoặc sửa R2.

## Ranh giới chức năng
Bộ Cron này **chỉ đồng bộ tệp R2→Google Drive và lưu liên kết tại D1**. Việc ghi dữ liệu nghiệp vụ từ D1 về `DATA_TONG` là một luồng đồng bộ khác, chưa tự động hóa bởi Worker này.

## Lưu ý chi phí, bảo mật
Cloudflare Cron/Worker/D1/R2 và API có hạn mức/tính phí tùy gói. Lịch 5 phút có ~288 lượt/ngày; lúc chưa cấu hình sẽ return ngay. Theo dõi Limits trước khi tăng tần suất, đặc biệt video lớn.
Secret phải chỉ được đặt trong Cloudflare secret store và không lưu ở GitHub. Google refresh token có thể bị thu hồi hoặc hết hạn; nếu hết hạn, Worker ghi lỗi cho quản trị để xử lý.
