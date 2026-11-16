# QBOOK UI V3.1 — Bàn giao cải tiến giao diện 16/11/2026

## Các thay đổi được triển khai

1. **Menu điều hướng điện thoại**
   - Bổ sung `role="dialog"`, `aria-modal`, tên vùng menu.
   - Khi mở, điều hướng bàn phím giữ focus trong menu (Tab/Shift+Tab), Escape đóng ngăn kéo.
   - Đóng bằng nút hoặc API trả focus về nút Menu.
   - Không thay đổi cây menu, quyền người dùng hoặc điều hướng nghiệp vụ.

2. **Liên kết bỏ qua menu**
   - Trước đăng nhập: đưa đến `#loginPage` (màn hình thực sự hiển thị).
   - Sau đăng nhập: đưa đến `#appPage`. Cả hai vùng nhận focus đúng khi điều hướng bàn phím.

3. **Dashboard Media**
   - Bổ sung biểu đồ cột nhóm quay / gửi hậu kỳ trong 14 ngày (múi giờ `Asia/Ho_Chi_Minh`).
   - Nguồn: `overview.activities`, đã tính từ `video_events` ở D1.
   - Chỉ tính sự kiện lần hoàn thành đầu tiên theo dữ liệu hiện có. Nếu chưa có sự kiện, hiển thị trạng thái rỗng minh bạch, không tạo số liệu giả.
   - Biểu đồ tự thu gọn trên màn hình nhỏ, có nhãn từng ngày và mô tả trợ năng.

4. **Kiểm thử hồi quy**
   - Thêm kiểm tra đóng menu bằng Escape, trạng thái `aria-modal`, Tab/Shift+Tab giữ focus.
   - Thêm kiểm tra biểu đồ lấy sự kiện thật và trạng thái chưa có dữ liệu.
   - GitHub Actions: **70/70 bài kiểm thử đạt** cho commit `81f12c455c58883f4e12086891d93b5f8c7f5f83`.
   - Cloudflare Pages Production: commit trên **success**.

## Không thay đổi
- Các quy trình Sale, Đóng hàng, Vận đơn, Quay, Hậu kỳ, Duyệt, Phát hành.
- API, D1, quyền nhân viên, Google Drive OAuth, dữ liệu nguồn.
- Không cấp quyền, thêm nhân sự hoặc sinh dữ liệu sản xuất thử trên Production.

## Giới hạn kiểm chứng và nghiệm thu bổ sung
- Đã mở được trang Production ở trình duyệt và đọc accessibility tree **trang đăng nhập**. Chưa có phiên đăng nhập để đối chiếu Dashboard trên thiết bị thật.
- Trình duyệt không phản hồi yêu cầu screenshot; không kết luận đã đo hình ảnh màn 375/390/768/1366 px.
- Nghiệm thu tiếp: 4 kích thước màn hình; 3 vai trò Media và Sale/Đóng hàng/Vận đơn; cuộn ngang bảng; focus/contrast; Lighthouse Performance; thử tải tệp Drive thực tế khi đã cấp quyền.

Đường dẫn: https://qbooks-quantri.pages.dev/ và https://qbooks-quantri.pages.dev/video.html
