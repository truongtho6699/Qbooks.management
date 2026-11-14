# QBOOK Media — Biên bản nghiệm thu kỹ thuật và điều kiện đưa vào vận hành (14/11/2026)

## 1. Đã kiểm chứng qua mã nguồn, kiểm thử tự động và Cloudflare D1
- Production URL: https://qbooks-quantri.pages.dev/video.html
- Quy trình kiểm thử cô lập bằng 3 vai trò `Quay → Hậu kỳ → Trả sửa → Nộp lại → Duyệt → Phát hành`: **PASS**.
- Các ca phủ cả việc nhân viên Hậu kỳ không thể tự phát hành, VIEW không được ghi dữ liệu, người duyệt phải có quyền `manage`, lưu mốc sản lượng lần đầu duy nhất.
- Tải Google Drive được kiểm thử mô phỏng HTTP: **PASS** cho resumable 308 → 200, liên kết thư mục gắn trong metadata, từ chối thư mục rỗng, chặn phiên tải chuyển sang tên miền lạ, lỗi 403 và phản hồi thiếu dung lượng.
- Hệ thống đã có màn cấu hình thư mục Google Drive **cho đầu sách đang tồn tại**, lưu qua API `PATCH /api/video/books/:id/drive-folder`. Hỗ trợ mã nhập `qbook-SP337` và mã UUID.
- Nút tải video chặn nếu đầu sách không có thư mục Drive. **Không còn tự lưu vào My Drive root**.
- Dashboard Media có mục **Mức độ sẵn sàng vận hành**, kiểm tra số đầu sách có thư mục, dấu hiệu Google OAuth Client ID và phân quyền nhóm nhân sự.
- GitHub Actions và Cloudflare Production xác nhận bản cập nhật mới nhất **success**.

## 2. Trạng thái dữ liệu D1 khi đối chiếu
| Hạng mục | Hiện trạng |
|---|---:|
| Đầu sách | 20 |
| Bài/tiết kế hoạch | 1.666 |
| Video đã tạo | 0 |
| Sự kiện sản xuất | 0 |
| Bản ghi phân quyền Media | 0 |
| Đầu sách chưa cấu hình Drive | 20 |

Cloudflare Production có cấu hình `GOOGLE_CLIENT_ID` dạng plain_text. **Chưa xác minh Google OAuth consent screen / authorized origins / quyền thư mục trên tài khoản nhân viên thật.**

Không tạo tài khoản nhân viên thử, video mô phỏng, file Drive hoặc bản ghi sản xuất trên D1 Production. Không thay đổi đơn Sale, đóng hàng, vận đơn.

## 3. Chưa thể xác nhận nghiệm thu đầu cuối thực tế
Vì chưa có ba tài khoản đã cấp vai trò Media và chưa kết nối được trình duyệt/phiên Google có quyền Drive, **chưa thể kết luận** nhân viên quay/hậu kỳ tải video thật thành công hoặc Google OAuth cấp quyền hoàn chỉnh. Kết quả kiểm thử hiện tại là **mô phỏng có kiểm soát, không phải thao tác vận hành thực tế**.

## 4. Các bước quản trị cần thực hiện
1. Đăng nhập Qbook bằng Admin, vào **Quản trị hệ thống → Quản trị nhân sự / PIN**. Chọn 3 nhân viên khác nhau, cấp menu và thao tác:
   - Quay: `media.filmOverview`, `media.film`, `media.dashboard`; bật `can_film`.
   - Hậu kỳ: `media.postOverview`, `media.edit`, `media.dashboard`; bật `can_edit`.
   - Quản lý: `media.dashboard`, `media.adminOverview`, `media.edit`, `media.books`, `media.production`, `media.report`; bật `can_manage`. Menu `media.permissions` chỉ dành cho Admin hệ thống.
   - Không giao cùng một người nhiệm vụ biên tập và tự duyệt video do mình sửa.
2. Vào **Quản lý Media → Danh mục Media → Quản trị đầu sách**. Cập nhật liên kết `https://drive.google.com/drive/folders/...` cho sách thử nghiệm. Đảm bảo ba nhân viên có quyền đọc/ghi Google Drive phù hợp.
3. Kiểm tra Google Cloud OAuth: app dùng Client ID của Production, JavaScript origins cho `https://qbooks-quantri.pages.dev`, consent screen và tài khoản thử trong danh sách test users khi ứng dụng ở chế độ thử nghiệm.
4. Tạo kế hoạch video thử có mã `TEST_QBOOK_MEDIA_...` trên sách đã cấu hình. Không dùng video thật của khách hàng trong lần thử đầu.
5. Nhân viên Quay đăng nhập, chọn video, mở OAuth popup Drive, tải clip thử, kiểm tra đúng thư mục và bấm Lưu; đối chiếu D1 `status=ĐÃ QUAY`.
6. Nhân viên Hậu kỳ đăng nhập, tải bản dựng và gửi duyệt; đối chiếu `CHỜ DUYỆT`.
7. Người Quản lý trả sửa có lý do; nhân viên Hậu kỳ nộp lại; người Quản lý duyệt; cuối cùng kiểm chứng link YouTube bằng video thử phù hợp trước khi xác nhận phát hành. **Không tự động phát hành nội dung thật**.
8. Đối chiếu báo cáo ngày theo UTC+7: mỗi video chỉ có một lần quay đầu và một lần nộp hậu kỳ đầu được tính; xem log `video_events`, `video_audit`.
9. Kiểm thử trên điện thoại có mạng di động, video dung lượng nhỏ trước, sau đó kiểm thử dung lượng lớn phù hợp ngân sách lưu trữ.

## 5. Điều kiện nghiệm thu
- 3 tài khoản đúng menu và đúng quyền; tài khoản VIEW không được ghi.
- OAuth thực tế cấp được quyền; thư mục Google Drive được chia sẻ đúng, không tạo tệp ở My Drive root.
- Video từ quay → hậu kỳ → duyệt → phát hành chuyển đúng trạng thái, từ chối hành động không hợp lệ.
- Sản lượng/tiến độ khớp D1 và sự kiện nhật ký.
- Thử lại khi có lỗi mạng: không có video trùng, không tạo bản ghi sản lượng trùng.

**Chưa công bố đạt nghiệm thu vận hành thực tế cho đến khi checklist trên được xác nhận.**
