# QBOOK Media V2.2 — bàn giao ngày 14/11/2026

## Đã triển khai
- Sửa phân quyền hiển thị menu Xử lý video cho tài khoản Quản lý Media (chỉ cần `can_manage`).
- Đồng bộ màn hình Quản lý Media với API danh sách video có phân trang, tìm theo đầu sách/tên bài, lọc trạng thái kiểm duyệt: Chờ duyệt, Đã duyệt, Yêu cầu sửa.
- Bảng điều khiển Quay/Hậu kỳ/Chi tiết đầu sách sử dụng số tổng hợp ở Cloudflare D1, không tính KPI từ 100 dòng đang hiển thị.
- Dashboard cho phép mở thẳng hàng đợi Chờ duyệt và Yêu cầu sửa.
- D1 có hai trigger `trg_video_film_first_event` và `trg_video_edit_first_event` (migration `0014_video_atomic_milestone_triggers.sql`): khi lần đầu ghi `filmed_at`/`edited_at`, sự kiện được ghi trong cùng câu lệnh cập nhật. Ràng buộc duy nhất của migration 0013 ngăn hai lần ghi mốc đầu tiên.
- Giữ nguyên chuỗi quyền V2: nhân viên quay → hậu kỳ gửi duyệt → quản lý (không phải chính người sửa) phê duyệt hoặc trả sửa → quản lý phát hành.
- Bổ sung kiểm thử hồi quy để phát hiện lách quyền phát hành, tự duyệt, URL YouTube giả, lọc trang/chờ duyệt và ghi đè mốc quay.
- GitHub Actions hoàn thành thành công **15 ca kiểm thử** (commit `a7f3fc5f0f91bc387e686058c5d3c1ff6bc239df`). Cloudflare Pages Production xác nhận triển khai thành công cùng commit.

## Đối chiếu dữ liệu Production
D1 sau nâng cấp: **20 đầu sách, 1.666 bài học, 0 video, 0 sự kiện video, 0 bản ghi phân quyền Media**, 2 trigger hoạt động ở mức cấu trúc đã được xác minh. Không tạo dữ liệu video giả hoặc cấp quyền thật.

## Giới hạn nghiệm thu
- GitHub Actions kiểm thử mock API, **không thay thế kiểm thử trình duyệt bằng 3 tài khoản thật**. Chưa kiểm chứng tải video trực tiếp từ điện thoại lên Google Drive và các quyền OAuth.
- Hai trigger đã kiểm tra tồn tại trên D1, chưa thử bằng video thật. Các sự kiện phê duyệt/đăng có ghi nhật ký riêng, chưa đồng nhất trong một giao dịch nguyên tử.
- Bảng sản lượng chỉ ghi một mốc quay và một mốc hậu kỳ đầu tiên trên mỗi video; **không phải số giờ lao động, không dùng để tính thưởng trực tiếp**.
- Dashboard chưa có đo hiệu năng thực tế và đối chiếu dữ liệu khi số video > 1000.
- Media hiện chưa cấp role grants: Admin hệ thống có thể vào phân hệ, nhân viên khác chưa được phép nếu chưa cấp quyền.

## Nghiệm thu kế tiếp
1. Cấp quyền ba tài khoản thử thật (Quay, Hậu kỳ, Quản lý) sau khi người quản trị xác nhận.
2. Thực hiện 1 chuỗi video thử có mã đánh dấu; Quay → Hậu kỳ → Chờ duyệt → Yêu cầu sửa → Duyệt → Phát hành, có các trường hợp quyền bị từ chối.
3. Đối chiếu `video_events` với video, ngày VN UTC+7, cập nhật dashboard và hành động ấn nút.
4. Thử tốc độ dashboard, danh mục 1.666 bài học và danh sách video phân trang trên thiết bị di động.
5. Sau nghiệm thu mới xem xét vận hành chính thức, tính KPI thưởng hoặc nhập lịch sử.

## Tham chiếu
- Repo: https://github.com/truongtho6699/Qbooks.management
- Production: https://qbooks-quantri.pages.dev/video.html
- Tài liệu V2: `docs/VIDEO_MANAGER_V2_2026-11-14.md`
- Migration: `migrations/0012_video_approval_events.sql`, `0013_video_unique_milestone_events.sql`, `0014_video_atomic_milestone_triggers.sql`.
