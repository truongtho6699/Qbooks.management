# Đồng bộ dữ liệu D1 → Google Sheets và R2 → Google Drive (11/11/2026)

## Phiên bản đã triển khai
QBooks: https://qbooks-quantri.pages.dev/
Nguồn gốc: Apps Script V35 và Google Sheets `1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw`.
Drive gốc: `DON_HANG` theo `CAU_HINH!B3`. R2 `qbooks-media` vẫn giữ bản gốc.

### Cơ chế
- **Mỗi thao tác có sự xác nhận của Admin.** Chưa có đồng bộ tự động 24/7 vì chưa có dịch vụ/khóa Google được ủy quyền lâu dài.
- Google OAuth quyền `spreadsheets` và `drive` được cấp từ nút `Kết nối Google để ghi Sheets và Drive`. Token chỉ tồn tại trong bộ nhớ trang; không lưu trong D1 hoặc mã nguồn.
- Chuyển R2 → Drive: tải theo từng phần 8 MiB, dùng Google Drive resumable upload; D1 ghi lại phiên và tiến độ để có thể tiếp tục; tệp R2 không bị xóa. Drive kiểm tra `upload_id` và kích thước để tránh nhân đôi.
- Thư mục Drive theo nghiệp vụ V35: `DON_HANG/{ID_DON}_{MA_HOA_DON}/DONG_HANG/{01_ANH_HOA_DON,02_VIDEO_DONG_HANG,03_HANG_HOA}` hoặc `GIAO_HANG`.
- Ghi D1 → Google Sheets: chỉ `orders.local_dirty=1` và `source_system='GOOGLE_SHEETS'`. Phải chuyển hết tệp R2 của đơn đó sang Drive trước; so bản ghi gốc `source_payload` 42 cột, kiểm tra trùng ID, thay đổi ngoài luồng và chỉ cập nhật những ô liên quan. Sau khi ghi, đọc lại để kiểm tra rồi mới đổi `local_dirty=0`.
- Các cột Sale `A:J`, `AK` và `AM:AP` không bị thay đổi (trừ `AL` mã nhóm khi luồng mới thay đổi nhóm). Đặc biệt không can thiệp dữ liệu nhân sự PIN.

### Điều kiện Google Cloud
- Project number: `655888224456`; OAuth Client ID ứng dụng Web đã cấu hình ở Pages.
- Bật **Google Sheets API**: https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=655888224456
- Bật **Google Drive API**: https://console.cloud.google.com/apis/library/drive.googleapis.com?project=655888224456
- Tại **Google Auth Platform → Data access**, đăng ký các phạm vi `https://www.googleapis.com/auth/spreadsheets` và `https://www.googleapis.com/auth/drive`, nếu bảng đồng ý Google yêu cầu.
- Tài khoản Google đăng nhập phải có quyền chỉnh sửa `DATA_TONG` (sheet được bảo vệ) và quyền tạo tệp/thư mục bên trong Drive `DON_HANG`.
- Với dự án Google OAuth ở trạng thái Testing, tài khoản phải được thêm trong Test users. Phạm vi Drive toàn quyền là phạm vi rộng; trước khi dùng cho toàn công ty, xem xét yêu cầu Google verification.

### Các bước sử dụng (lưu ý dữ liệu thật)
1. Đăng nhập **Admin** tại QBooks. Vào **Quản trị → Đồng bộ QBooks → Google**.
2. Bấm **Kiểm tra dữ liệu chờ đồng bộ**; kiểm tra mã đơn và tệp.
3. Bấm **Kết nối Google để ghi Sheets và Drive**; chọn đúng tài khoản Google đang sở hữu file và thư mục.
4. Tích xác nhận chuyển tệp, rồi bấm **Chuyển sang Drive** cho từng tệp. Có thanh tiến độ, có thể tiếp tục khi bị gián đoạn. **Video gần 580 MB có thể mất nhiều thao tác tải từng phần**.
5. Khi **tất cả tệp của đơn đã có trên Drive**, tích xác nhận ghi trang tính. Bấm **Ghi đơn về DATA_TONG**.
6. Mở Google Sheet, kiểm tra `ID_DON`, trạng thái, nhân sự đóng hàng, thời gian, liên kết thư mục ảnh/video, số thùng và ghi chú. Đối chiếu 1 đơn đầu tiên trước khi thực hiện các đơn khác.
7. Kiểm tra `local_dirty` trở về 0 qua **Kiểm tra dữ liệu chờ đồng bộ**.

### Nguyên tắc an toàn
- Không chạy thao tác ghi nếu chương trình Apps Script V35 đang đồng thời sửa cùng đơn; Google Sheets API không hỗ trợ so sánh-đổi nguyên tử cho ô. Trong phiên đầu tiên nên bảo đảm đơn đích không bị tác động đồng thời.
- Google OAuth token hết hạn sau một thời gian; bấm **Kết nối Google** lại để tiếp tục, không nhập Google Client Secret trong ứng dụng.
- Nếu Google báo 403, kiểm tra quyền chỉnh sửa vùng bảo vệ DATA_TONG và quyền Drive của tài khoản. Không bỏ bảo vệ Sheet.
- Nếu chuyển tệp thất bại, giữ nguyên tệp R2; không ghi DATA_TONG khi chưa chuyển đủ tệp.
- Nếu Sheet có trường bị thay đổi kể từ thời điểm nhập D1, trả xung đột; không ghi đè trường đó. Bắt buộc xử lý thủ công khác biệt.
- Không chạy đồng bộ cả hệ thống chưa nghiệm thu bằng vài đơn thử.
- Để đồng bộ **tự động không cần người thao tác**, cần cầu nối Apps Script riêng chạy với quyền chủ sở hữu hoặc thông tin ủy quyền Google phù hợp; bảo vệ bằng xác thực máy chủ, bảng nhật ký, điều kiện xung đột và xử lý thời gian dài.

### Tình trạng kiểm thử
Kiểm thử logic bằng GitHub Actions; kiểm tra triển khai Pages và cấu trúc D1. **Chưa xác minh chuyển thực tế 580 MB và cập nhật dữ liệu thật từ tài khoản Google có quyền** vì việc này cần người dùng cấp Google OAuth trên trang QBooks và xác nhận thao tác. Không coi việc mã nguồn triển khai là đã hoàn tất đồng bộ thực tế.
