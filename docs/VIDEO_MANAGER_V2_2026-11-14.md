# QBOOK VIDEO MANAGER — RELEASE V2 (2026-11-14)

## Mục tiêu
Khắc phục lỗi quy trình duyệt/phát hành và sai lệch sản lượng; nâng cấp dashboard, báo cáo, tìm kiếm và phân trang. Phạm vi độc lập phân hệ Media; không thay đổi bảng đơn hàng, dữ liệu Google Sheets gốc, hoặc tệp video thực tế.

## Những thay đổi đã triển khai trong mã nguồn
1. **P0 — Duyệt và phát hành tách quyền**: nhân viên Hậu kỳ chỉ chọn `ĐANG HẬU KỲ` hoặc `CHỜ DUYỆT`. Vai trò Quản lý (`can_manage`) hoặc Admin duyệt/từ chối; quản lý cùng tài khoản biên tập không thể tự duyệt; lý do từ chối bắt buộc. Chỉ cho phép phát hành sau khi duyệt và có liên kết YouTube hợp lệ.
2. **P0 — Dữ liệu sản lượng**: bảo toàn thời điểm và nhân sự của lượt quay đầu tiên và lần gửi hậu kỳ đầu tiên. Bảng `video_events` ghi sự kiện, chỉ mục duy nhất cho `FILM_COMPLETED` / `EDIT_SUBMITTED`; ghi lại trạng thái sau duyệt và phát hành. Mỗi video chỉ được ghi nhận *một lần hoàn thành đầu tiên*, không lấy đó làm thời gian lao động thực tế.
3. **P1 — Dashboard**: hiển thị số lượng đầu sách, bài/tiết trong kế hoạch, video đã quay, video đã phát hành; cảnh báo chờ duyệt, cần sửa; ngày giờ cập nhật. Số bài chưa có kế hoạch video dựa trên `video_lessons` không có liên kết `video_items.lesson_id`, không dùng phép trừ tùy tiện giữa số bài và số video.
4. **P1 — Sản lượng theo nhân viên/ngày**: API `/api/video/production?day=YYYY-MM-DD` truy vấn `video_events` theo múi giờ Việt Nam UTC+7.
5. **P1 — Danh sách lớn**: API `/api/video/items` có `page`, `pageSize` (10–100), `book`, `q`, `status`, `scope=edit`. UI có tìm kiếm toàn bộ ở máy chủ và điều hướng phân trang trên màn Quay/Hậu kỳ, không chỉ lọc 100 bản ghi đầu.
6. **UX**: màn hình Quản lý Media hiển thị đường dẫn vị trí (breadcrumb), giữ cây menu ba cấp đã duyệt.

## D1 — Các thay đổi chỉ bổ sung
- `migrations/0012_video_approval_events.sql`: bổ sung `review_status`, `reviewed_by`, `reviewed_at`, `review_note` và bảng `video_events`.
- `migrations/0013_video_unique_milestone_events.sql`: duy nhất lượt quay và lượt gửi hậu kỳ đầu tiên.
- Không xóa hoặc ghi đè dữ liệu `DATA_VIDEO`, `video_books`, `video_lessons`, `video_items`, đơn hàng, vận đơn.

## Ma trận quyền đối với Media
| Thao tác | Quay | Hậu kỳ | Quản lý Media | Admin |
|---|---|---|---|---|
| Tạo kế hoạch video | Không | Không | Có | Có |
| Xác nhận video quay | Có | Không | Không (trừ khi được cấp quyền Quay) | Có |
| Biên tập và gửi duyệt | Không | Có | Không (trừ khi được cấp quyền Hậu kỳ) | Có |
| Duyệt/trả sửa | Không | Không | Có, trừ video do chính mình biên tập | Có, trừ video do chính mình biên tập |
| Công bố video đã duyệt | Không | Không | Có | Có |
| Phân quyền Media | Không | Không | Không | Có |

## Kiểm chứng
- `node --test` qua GitHub Actions kiểm tra bảo mật quy trình, trạng thái báo cáo và những kiểm thử hồi quy hiện có.
- Các thay đổi frontend/backend được kiểm tra cú pháp JavaScript, không tương đương với nghiệm thu trình duyệt.
- Cloudflare Pages tự động triển khai từ nhánh `main`; chỉ kết luận thành công sau khi phiên bản cuối ở trạng thái `success`.
- D1 xác nhận trước nghiệm thu: 20 đầu sách, 1.666 bài học, 0 video, 0 sự kiện ghi nhận. Không tạo dữ liệu sản xuất mô phỏng trên Production.

## Công việc còn phải nghiệm thu hoặc phát triển
- **Bắt buộc trước vận hành**: cấp quyền Media thực tế cho người quản lý, quay, hậu kỳ; thử ba tài khoản riêng biệt; thử quay–nộp hậu kỳ–duyệt–phát hành; thử trả sửa và sửa lại; xác nhận số liệu báo cáo; thử điện thoại, tốc độ và tải video lớn.
- **Phiên bản tiếp theo**: một video thành phẩm có nhiều clip nguồn và nhiều bản dựng; lưu thời lượng thật, phiên bản, lịch sử file; quản lý phê duyệt bảng điểm thưởng; đồng bộ cảnh báo Zalo/YouTube, nhập video lịch sử.
- Lưu ý: sửa đổi trạng thái video và ghi `video_events` hiện là các thao tác tuần tự; đánh giá giao dịch nguyên tử và phục hồi sự kiện trước khi tính thưởng/tài chính chính thức.
