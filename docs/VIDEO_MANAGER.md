# QBOOK Video Manager — responsive desktop/mobile

Thiết kế theo 12+ màn hình tham chiếu hình ảnh ngày 11/11/2026. Phân hệ này độc lập với Đóng hàng/Vận đơn.

## Trang vào
- Đường dẫn dự kiến khi Cloudflare Pages triển khai được: `https://qbooks-quantri.pages.dev/video.html`.
- Đăng nhập bằng phiên QBooks sẵn có (Email/PIN hoặc Google); không tạo tài khoản hay API key riêng.
- Trên QBooks sau đăng nhập có lối vào **Quản lý sản xuất video sách**.

## Cấu trúc giao diện
**Desktop**: thanh trái màu xanh navy; nội dung rộng, KPI và bảng theo nhóm chức năng.
**Mobile**: menu cố định ở cuối màn hình (Tổng quan, Quay, Hậu kỳ, Đầu sách, Khác); bảng ngang có cuộn; biểu mẫu một cột; hỗ trợ safe-area iOS.

## Các màn hình
1. Bảng điều khiển tổng quan thực tế.
2. Tổng quan quản trị (chỉ Admin/Quản lý): KPI mục tiêu, sản lượng, tiến độ từng đầu sách, hiệu suất nhân viên, trạng thái video.
3. Tổng quan quay.
4. Quay bài: chọn video, xem chi tiết, tải tệp hoặc nhập liên kết Drive, ghi chú và xác nhận đã quay.
5. Lập kế hoạch video: thêm video theo đầu sách, bài học, giáo viên.
6. Tổng quan hậu kỳ.
7. Xử lý video/biên tập và phát hành: kết quả, ghi chú, YouTube, trạng thái.
8. Sản lượng hằng ngày: chọn ngày và nhân sự.
9. Tiến độ đầu sách: kế hoạch, đã quay, đã phát hành, tiến độ.
10. Chi tiết đầu sách: trạng thái từng video, mở chi tiết.
11. Báo cáo tổng hợp và xuất CSV.
12. Quản trị đầu sách: thêm sách, chỉ tiêu, giảng viên, thư mục Drive.
13. Quản trị nhân viên.
14. Phân quyền tài khoản chuyên biệt của phân hệ Video (Admin, Quản lý, Quay, Hậu kỳ).
15. Lịch sử thao tác: người dùng, hành động, thời gian, video.

## Dữ liệu
- Migration: `migrations/0007_video_manager.sql`.
- Bảng: `video_books`, `video_items`, `video_role_grants`, `video_audit`.
- Chỉ tài khoản đã được cấp quyền phân hệ video mới được gọi API; Admin QBooks được toàn quyền.
- Không có số liệu KPI 500/320/245 giả. Chỉ tính từ bảng video khi đã nhập dữ liệu thật.
- Không thay đổi `orders`, `DATA_TONG`, `SALE_DONG_DON` hay trình Apps Script V35.
- Google Drive: tải video trực tiếp từ trình duyệt qua OAuth, upload theo phần 8 MiB, tối đa 2 GiB/60 phút và lưu liên kết. Yêu cầu Google Drive API đã kích hoạt, người dùng có quyền thư mục đầu sách.

## Dữ liệu nguồn cũ cần kiểm tra trước khi nhập
Dự án sản xuất video trước đây nói đến `DATA_VIDEO` (19 cột A:S) và hơn 500 video. Khi đối chiếu ngày 11/11/2026, tìm được Google Sheet `QUAY VIDEO MKT - C UYỂN LÀM` (`18sRGnSTVTidkdDYpvt5olF8QldqOUgXgnPXG-p7fSeQ`) có tab `DATA_VIDEO`, nhưng tab đó chỉ có 19 tiêu đề và **không có dòng dữ liệu** tại thời điểm đọc. Vì vậy không tự động nhập từ file này hoặc giả định đây là file nguồn đúng.

## Kiểm thử & trạng thái triển khai
- GitHub Actions: `node --test`, kiểm tra cú pháp hiện đã đạt.
- Cloudflare Pages: **chưa triển khai được bản chức năng mới**. Nhật ký build cho biết `Compiled Worker successfully` nhưng khi xuất bản Function báo `binding DB of type d1 failed to generate`. Đây là lỗi ở giai đoạn gắn D1, không phải lỗi biên dịch. Đã thử triển khai lại và vẫn gặp lỗi.
- Không tuyên bố ứng dụng Video Manager live cho đến khi Cloudflare deployment `success` và kiểm thử đăng nhập + API thực tế đạt.
- Mọi tệp mã được lưu GitHub `main`: `public/video.html`, `public/video.css`, `public/video.js`, `src/video-manager.js`.
- Tài khoản cũ, 15 đơn D1 và 3 tệp R2 vẫn giữ nguyên. Không ghi dữ liệu video mẫu vào D1.

## Kiểm thử chấp nhận trước khi vận hành
1. Trang `/video.html` có sidebar trên desktop và thanh menu dưới trên iPhone/Android.
2. Admin tạo đầu sách → tạo kế hoạch video → cấp quyền người quay/hậu kỳ.
3. Người quay mở video, tải hoặc liên kết Google Drive → bấm xác nhận hoàn thành quay.
4. Người hậu kỳ nhận video, lưu xử lý → thêm YouTube và đánh dấu phát hành.
5. Quản lý xem KPI/tiến độ đầu sách, báo cáo ngày theo nhân viên và xuất CSV.
6. Nhân sự không có quyền không thể xem API Video hoặc đổi quyền.
7. Đối chiếu dữ liệu nguồn thực tế trước khi nạp từ Sheet cũ.
