# QBOOK UI V3 — Design System và nghiệm thu

Ngày áp dụng: 2026-11-16. Nguồn tham khảo: nextlevelbuilder/ui-ux-pro-max-skill, `SK-DESIGN-01`. Phạm vi: Quản lý giao hàng, Media, Quản trị hệ thống.

## Tư duy thiết kế
- Enterprise operations dashboard, rõ ràng, dễ đọc, ưu tiên tác nghiệp.
- Cùng ngôn ngữ hiển thị trên hai phân hệ; Sidebar nền xanh đậm, nội dung nền sáng, trạng thái có cả nhãn chữ.
- Không viết lại ứng dụng, không thay đổi logic API, OAuth, D1, phân quyền, dữ liệu nguồn.
- Tokens tại `public/ui-v3.css`; kế thừa và override `style.css`, `video.css`, `navigation.css`.

## Tokens
| Loại | Giá trị |
|---|---|
| Navy | `#102747` |
| Primary | `#2563EB` |
| Canvas | `#F4F7FB` |
| Surface | `#FFFFFF` |
| Text | `#14243B` |
| Muted text | `#475569` |
| Success | `#15803D` |
| Warning | `#A16207` |
| Danger | `#B91C1C` |
| Radius | 8/12/16 px |
| Font | Inter (nếu có), system-ui, Segoe UI |
| Min touch/button height | 44 px; mobile quick-nav 48 px |

## Kiến trúc menu
1. **Quản lý giao hàng:** Tổng hợp, Sale lên đơn, Đóng hàng, Vận đơn.
2. **Quản lý Media:** Tổng quan, Quay, Hậu kỳ, Quản lý, Danh mục; menu 3 cấp.
3. **Quản trị hệ thống:** menu độc lập, chỉ cho người có quyền.
- Menu được lọc theo quyền qua API; hiển thị và ẩn không cấp quyền mới.
- SVG icon thống nhất, `aria-expanded`, `aria-controls` riêng cho desktop/mobile; hỗ trợ focus khi thu/mở, Escape đóng ngăn kéo.
- Mobile giữ thanh lối tắt theo vai trò, tối đa 5 mục, đồng thời có drawer điều hướng đầy đủ.

## Dashboard Media
- 4 KPI đang có được giữ nguyên nguồn D1, bổ sung ngày giờ cập nhật.
- Biểu đồ thanh ngang: **tỷ lệ phát hành theo đầu sách**, dùng `video_books.target_count` và `published`, lọc đầu sách có kế hoạch, tối đa 10 đầu sách, sắp xếp theo tỷ lệ.
- Biểu đồ có nhãn, phần trăm, mô tả thay thế hỗ trợ trợ năng; không dùng dữ liệu mô phỏng.
- Bảng hàng đợi duyệt, nhân sự, và kiểm tra sẵn sàng vận hành giữ nguyên nghiệp vụ.

## Thiết bị
- Desktop ≥1024: sidebar rộng 244px, bảng dữ liệu, KPI, biểu đồ.
- Tablet 640–1023: bố cục linh hoạt, menu drawer.
- Mobile ≤639: 1 cột, KPI 2 cột, nút lớn; bảng chỉ cuộn trong vùng bảng; chú ý safe-area.
- CSS có `prefers-reduced-motion`; skip-link đi thẳng đến nội dung chính; focus ring nổi bật.

## Kiểm thử và nghiệm thu
- `node --test` tất cả kiểm thử hồi quy. Thêm `test/navigation-v3.test.js` cho ẩn menu theo quyền, nhấn mở/thu, focus, biểu tượng SVG, Escape.
- Xác minh trang `/` và `/video.html` cùng nạp `ui-v3.css`.
- Xác minh Production Cloudflare tương ứng commit đã kiểm thử thành công.
- Nghiệm thu thủ công vẫn cần: màn 375/390/768/1366px; xem từng vai trò SALE, PACKER, SHIPPER, VIEW, Media Film/Edit/Manager và Admin; thao tác bằng bàn phím, kiểm tra tương phản thực tế; Lighthouse/Web Vitals và tải Google Drive thật.
- Không đánh dấu đạt kiểm thử trực quan/hiệu năng nếu chưa có trình duyệt thực tế.
- Không tạo/thay đổi người dùng, PIN, video, đơn hàng, vận đơn hay dữ liệu D1 để thử giao diện.

## Đánh giá khả năng tương thích
Không thay đổi các endpoint hoặc luồng trạng thái. Mọi thay đổi V3 hiện tại đều thuộc lớp hiển thị và hành vi menu. Các biểu đồ mới chỉ đọc số tổng hợp từ D1 sẵn có.
