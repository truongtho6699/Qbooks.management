# QBOOK – UI/UX Giai đoạn 3: Hướng dẫn nghiệm thu

Phiên bản: 2026-11-21. Phạm vi: **giao diện và khả năng tiếp cận, đo kiểm cục bộ**. Không thay đổi D1, R2, Drive, API nghiệp vụ, quyền tài khoản.

## 1. Mục tiêu đã triển khai bằng mã nguồn

- Một lớp `public/design-system.css` thay các link Figma, UIUX Phase 1/2 riêng lẻ, giữ thứ tự CSS để tránh làm thay đổi giao diện đột ngột. Các CSS gốc `style.css`, `video.css`, `navigation.css`, `ui-v3.css`, `unified.css` vẫn tách riêng vì cần xác minh trực quan từng selector trước khi dọn hoàn toàn.
- Token dùng chung cho màu, border, radius, vùng chạm; trạng thái focus bàn phím nổi bật, giảm chuyển động và forced-colors.
- Dialog có nhãn thông qua `aria-labelledby`, tìm kiếm có tên truy cập, tiêu điểm chuyển từ menu điện thoại về tiêu đề nội dung.
- Chỉ số hiệu năng cục bộ: thêm `?perf=1` vào URL để xem FCP/LCP/CLS, tốc độ DOM; có thể xuất JSON. Không gửi số liệu lên máy chủ. Chỉ số thời lượng sự kiện dài nhất là **chỉ số chẩn đoán**, không phải INP chính thức.
- Kiểm tra tự động `npm run check` bao gồm kiểm tra HTML ID trùng, nhãn dialog, link CSS, tiêu chí a11y; `npm test` bao gồm kiểm tra hồi quy.

## 2. Kịch bản nghiệm thu nghiệp vụ

| Nhóm | Thao tác | Kết quả cần đạt |
|---|---|---|
| Đăng nhập | Tài khoản Sale, Đóng hàng, Vận đơn, Media và VIEW (nếu có) | Chỉ thấy đúng menu được cấp; không phát sinh lỗi |
| Tổng hợp | Mở mặc định và chọn lại kỳ ngày | Mặc định 7 ngày gần đây; các kỳ ngày khác hoạt động |
| Tổng hợp | Sắp xếp mới nhất/cũ nhất/GẤP/số hóa đơn, phân trang | Đúng thứ tự trong dữ liệu có quyền xem; lưu ý tối đa 300 đơn tải từ API |
| Sale lên đơn | Nhập khách cũ, chọn lấy lại địa chỉ, xem cảnh báo trùng | Chỉ điền thông tin khi bấm nút; không tự tạo đơn trùng |
| Đóng hàng | Chọn ảnh hóa đơn, ảnh hàng, video mẫu và xem trước | Tên tệp, kích thước, ảnh chính xác; không mất tệp khi chuyển trạng thái |
| Vận đơn | Chọn đơn, nhập chi phí, chọn ảnh và lưu | Tổng phí, danh sách ảnh và trạng thái đơn khớp |
| Media | Mở Tổng quan, Quay, Hậu kỳ, chọn đầu sách báo cáo | Dữ liệu tải từng phần; bảng lọc đúng, KPI hệ thống vẫn giữ nguyên |
| Mobile | iPhone Safari và Android Chrome, màn hình 375px và 412px | Không cuộn ngang ngoài ý muốn; vùng chạm >=44px |
| Bàn phím | Tab/Shift+Tab, Enter, Escape trên menu/drawer/modal | Focus rõ, Escape đóng drawer, không mắc kẹt ngoài menu khi mở |
| Quyền | Đăng nhập VIEW, Sale, Packer, Shipper, Admin | Không hiển thị chức năng bị chặn, không lộ dữ liệu trái quyền |
| Dữ liệu | So trước/sau khi đổi giao diện | Không phát sinh/xóa dữ liệu nghiệp vụ khi chỉ xem/lọc |

**Chú ý:** Không thực hiện thao tác gửi đơn thực, tải dữ liệu thật hoặc cập nhật tài khoản Production chỉ để kiểm thử khi chưa có người dùng nghiệp vụ chấp thuận. Dùng đơn mẫu và tài khoản thử nghiệm có quyền phù hợp.

## 3. Hiệu năng – đo thực tế và tiêu chí

### Công cụ đo cục bộ

- Mở `https://qbooks-quantri.pages.dev/?perf=1`, đăng nhập tài khoản được cấp.
- Tải lại trang, ghi FCP, LCP, CLS, DOM Ready. Sau khi chuyển menu, lưu ý rằng thông số Navigation Timing thể hiện tải trang, **không đo đầy đủ thời gian API chuyển menu SPA**.
- Nhấn **Lưu báo cáo JSON**. Báo cáo không chứa thông tin tài khoản, hóa đơn, media hoặc tệp.
- Chụp Lighthouse từ Chrome DevTools → Lighthouse (di động + desktop) trên các trang có thể truy cập; thu thập các lỗi Accessibility, Performance, Best Practices.
- Với dữ liệu thực tế dài hạn, dùng CrUX hoặc RUM được phê duyệt riêng; không tự triển khai thu thập telemetry/tài khoản.

### Ngưỡng đề xuất (chưa xác minh trên Production)

| Chỉ số | Đạt | Cần xem xét |
|---|---|---|
| LCP | <= 2,5 giây | > 2,5 giây |
| CLS | <= 0,1 | > 0,1 |
| INP chính thức (qua Chrome hoặc RUM) | <= 200 ms | > 200 ms |
| Lighthouse Accessibility | >= 90 | < 90 |
| Không lỗi JS ở luồng chính | Bắt buộc | Bất kỳ lỗi gây chặn |
| Thao tác mở Media | Có phản hồi/chờ rõ ràng | Trắng màn hình hoặc treo |
| Không mất dữ liệu trong quá trình thay CSS | Bắt buộc | Có thay đổi không mong muốn |

Không nhầm **thời lượng sự kiện lớn nhất** trong bảng chẩn đoán với INP đo theo chuẩn Web Vitals. Không dùng kết quả môi trường chưa đăng nhập để kết luận hiệu năng các menu nghiệp vụ.

## 4. Trạng thái nghiệm thu

- [x] Mã nguồn: gom CSS override; bổ sung token/focus/a11y.
- [x] Mã nguồn: đo hiệu năng opt-in, không gửi telemetry.
- [x] Mã nguồn: kiểm tra ID trùng, aria dialog, CSS, syntax và hồi quy.
- [ ] Lighthouse thực tế desktop trên từng phân hệ.
- [ ] Lighthouse thực tế mobile trên từng phân hệ.
- [ ] Kiểm thử sau đăng nhập trên iPhone và Android vật lý.
- [ ] Nghiệm thu thao tác nghiệp vụ có xác nhận của từng vai trò.
- [ ] Đối chiếu ảnh chụp với hai trang Figma từng màn hình.
- [ ] Refactor các lớp CSS gốc sau khi đã có kiểm thử ảnh chụp tự động.

## 5. Điều không thay đổi

Giữ nguyên D1, R2, cơ chế lưu Google Drive, phân quyền, cập nhật đơn, quản lý Media và quy tắc không được đóng trình duyệt trước khi video từ thiết bị đã tải xong. Không phát hành ứng dụng native iOS/Android trong phạm vi Giai đoạn 3.
