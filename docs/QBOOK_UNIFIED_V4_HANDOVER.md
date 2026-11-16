# QBOOK UNIFIED V4 — Hợp nhất Giao hàng và Media

Ngày triển khai: 16/11/2026.

## Mục tiêu
Một hệ thống, một URL chính, một trang đăng nhập và phiên làm việc, một menu phân cấp 3 nhóm; không còn chuyển giữa hai ứng dụng độc lập. Giữ nguyên logic nghiệp vụ, API, Cloudflare D1, R2, Google Sheets, Google Drive, dữ liệu và quyền hiện có.

## Đường dẫn
- **Ứng dụng chính:** https://qbooks-quantri.pages.dev/
- **Liên kết Media trong cùng ứng dụng:** https://qbooks-quantri.pages.dev/?section=media&view=dashboard
- **Liên kết cũ:** `/video.html?view=film` tự chuyển hướng tới `/?section=media&view=film`, không chạy giao diện/đăng nhập riêng.

## Kiến trúc
- **Một shell:** `public/index.html` chứa đăng nhập, header, sidebar, menu dưới điện thoại, ngăn kéo di động, khu vực Giao hàng và khu vực Media nhúng.
- **Một bộ định tuyến UI:** `public/app.js`, `window.QbookShell` điều phối chuyển menu và cập nhật URL bằng History API mà không reload.
- **Giao hàng:** giữ nguyên các bộ điều khiển trong `public/app.js`.
- **Media:** `public/video.js` là module ES được tải khi cần bằng `import('/video.js')`; công khai `window.QbookMedia.start(view)`, `navigate(view)`, `reset()`. Không có iframe, không tạo phiên đăng nhập riêng.
- **Điều hướng chung:** `public/navigation.js` lọc menu theo quyền `/api/menu-access` cho cả ba nhóm. Chọn menu Media làm hiện `unifiedMediaView`; chọn Giao hàng/Quản trị ẩn Media và hiện vùng tương ứng.
- **CSS:** `video.css` nạp trước `style.css` để tránh tác động ngược vào Giao hàng; `ui-v3.css` và `unified.css` tạo giao diện chung, đáp ứng điện thoại.
- **Phiên:** cả hai phân hệ dùng `sessionStorage.qbooks_token`. Khi logout, Media xóa bộ đệm tài khoản/quyền/dữ liệu đã tải, tránh lẫn dữ liệu người dùng.
- **Tương thích link:** video.html được duy trì dưới dạng chuyển hướng HTTP HTML/JS client-side. Điều hướng trực tiếp qua query `section=media&view=...`.

## Cấu trúc menu

1. **Quản lý giao hàng:** Tổng hợp, Sale lên đơn, Đóng hàng, Vận đơn.
2. **Quản lý Media:** Tổng quan, Quay video, Hậu kỳ, Quản lý, Danh mục Media. 15 chức năng cấp 3 giữ nguyên.
3. **Quản trị hệ thống:** chỉ hiện khi có quyền.
Tài khoản VIEW chỉ thấy những menu được phép, các kiểm tra quyền API hiện có tiếp tục hoạt động.

## Kiểm thử tự động
- `test/unified-shell.test.js`: chỉ một trang đăng nhập, duy nhất ID, khu Media nhúng, không iframe, một menu di động, link cũ, lazy import, quyền và xóa cache logout.
- Các bộ kiểm thử hiện có tiếp tục chạy qua GitHub Actions.
- **Không phát sinh thử nghiệm trên dữ liệu Production.**

## Trạng thái nghiệm thu
- Đã xác nhận qua trình duyệt: `/video.html?view=film` chuyển đến **một trang chính** `/?section=media&view=film`, hiển thị trang đăng nhập QBOOK · QUẢN TRỊ thống nhất.
- Đã kiểm tra phần giao diện đăng nhập qua accessibility tree. **Chưa có phiên tài khoản Qbook thật để thao tác trực tiếp sau đăng nhập.**
- Cần tiếp tục nghiệm thu thực tế: chuyển 19 menu theo quyền, luồng Sale/Đóng hàng/Vận đơn, Media Quay/Hậu kỳ/Duyệt, logout/login tài khoản khác, UI ở 390/768/1366px.
- Không kết luận hoàn tất nghiệm thu người dùng cuối chỉ bằng kiểm thử mã nguồn.

## Không thay đổi
- Các endpoint `/api/*`, cấu trúc cơ sở dữ liệu D1, tệp R2 và Drive, dữ liệu Google Sheets, trạng thái đơn/video, quyền nhân sự.
