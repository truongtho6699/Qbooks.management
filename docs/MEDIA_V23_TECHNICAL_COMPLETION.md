# QBOOK Media V2.3 — cập nhật kỹ thuật 14/11/2026

## Các hạng mục hoàn thiện trong lần này

1. **Phân quyền menu Media:** `media.permissions` được khai báo chính xác trong menu registry và chỉ Admin hệ thống sử dụng. Người dùng VIEW và người Quản lý Media không tự phân quyền cho mình, kể cả khi được gán một override.
2. **Chặn tải nhầm thư mục Drive:** Qbook đã có cơ chế kiểm tra cấu hình thư mục trước khi tải; nay kiểm tra thêm *quyền thực tế* của tài khoản Google đang đăng nhập bằng Drive API `files.get` với `capabilities.canAddChildren`. Nếu không đủ quyền, ứng dụng dừng trước khi tạo phiên tải resumable.
3. **Nút kiểm tra Drive theo từng đầu sách:** tại **Quản lý Media → Danh mục Media → Quản trị đầu sách**, sau khi lưu thư mục, nhấn **Kiểm tra quyền Drive**. Ứng dụng sử dụng Google OAuth trực tiếp trong trình duyệt để xác minh đúng thư mục và quyền thêm tệp, không tải file, không ghi D1. Hủy xác thực cũng đặt lại trạng thái nút.
4. **Kiểm thử tải có xác thực:** mô phỏng trường hợp thư mục thiếu quyền ghi, ID Drive trả sai, liên kết là tệp thay vì thư mục, session upload chuyển tên miền lạ, lỗi HTTP 403, hoàn tất không đủ dung lượng và upload nhiều phần.
5. **Nghiệm thu mô phỏng:** phân quyền ba vai trò, Quay → Hậu kỳ → Trả sửa → Nộp lại → Duyệt → Phát hành vẫn được kiểm tra ở bộ hồi quy.

## Trạng thái xác minh

- GitHub Actions cho commit `90270ecb050788b6b8eb8d0f4ae2e7e820b5f4a9`: **63/63 test thành công**.
- Cloudflare Pages Production: cùng commit **deploy success**.
- D1 Production (chỉ đọc): 20 đầu sách, 1.666 bài học, 0 video, 0 sự kiện sản xuất, 0 grant Media, 20/20 đầu sách thiếu thư mục Drive.
- Không tạo nhân sự mới, không cấp quyền thật, không tải video thật và không thay đổi dữ liệu đơn hàng.

## Điều kiện cần Admin thực hiện trước nghiệm thu vận hành

- Cấp vai trò và menu Quay, Hậu kỳ, Quản lý cho ba nhân sự *khác nhau*.
- Cấu hình thư mục Google Drive cho ít nhất một đầu sách; chia sẻ quyền chỉnh sửa cho người quay/hậu kỳ; từng người chọn **Kiểm tra quyền Drive** để xác minh OAuth và phân quyền.
- Chạy chu trình với video thử nhỏ và đối chiếu `video_items`, `video_events` theo ngày UTC+7.
- Chưa có thử nghiệm thực tế từ trình duyệt với tài khoản nhân viên, do công cụ kết nối trình duyệt không khả dụng và chưa có quyền Media thật.
- **Không kết luận đã nghiệm thu tải tệp thực tế** chỉ dựa trên kiểm thử mô phỏng.

## Đường dẫn
- Trang quản lý: https://qbooks-quantri.pages.dev/video.html
- Hướng dẫn gốc: docs/MEDIA_ACCEPTANCE_HANDOVER_2026-11-14.md
