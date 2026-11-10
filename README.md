# Qbooks Management · Cloudflare Workers + D1 + R2

Bản MVP độc lập với Google Apps Script V35, dành cho quy trình **Sale → Đóng hàng → Vận đơn**.

## Trạng thái
- Mã nguồn đã chuẩn bị, **chưa triển khai** vì R2 chưa được kích hoạt trong tài khoản Cloudflare.
- Không có kết nối nào tới Google Sheets/Drive đang vận hành. Chưa di chuyển dữ liệu.
- Kho GitHub là công khai; không lưu PIN, khóa truy cập hay dữ liệu khách hàng thật vào đây.

## Chức năng MVP
- Đăng nhập email + mã PIN, phân quyền ADMIN / SALE / PACKER / SHIPPER.
- Danh sách đơn; Sale tạo đơn, nhóm nhiều đơn chung một mã vận đơn.
- Đóng hàng: chỉ hiện `CHỜ ĐÓNG HÀNG`; Vận đơn: chỉ hiện `CHỜ VẬN ĐƠN`.
- Một nút lưu: kiểm tra mọi ảnh/video được đưa lên R2 rồi mới cập nhật trạng thái.
- Tải video nhiều phần (multipart, 8 MiB mỗi phần) đi từ trình duyệt đến Worker cùng tên miền và stream vào R2; D1 lưu phần đã hoàn tất để tiếp tục khi mạng mất. Ảnh tải bằng PUT qua Worker.
- Lưu tên đơn dạng `HD0011 - Sale: Admin`; giữ nguyên mọi mã hóa đơn trong dữ liệu.

## Các bước kích hoạt (chưa tự làm)
1. Chọn tài khoản Cloudflare. Kích hoạt **R2** trong bảng điều khiển Cloudflare (có thể cần thiết lập thanh toán), xác nhận phí/giới hạn trước khi kích hoạt.
2. Tạo bucket riêng `qbooks-media` và cơ sở dữ liệu D1 riêng `qbooks-db`; không tái sử dụng database ứng dụng khác.
3. Cấu hình binding `MEDIA` (R2), `DB` (D1), `ASSETS` (Worker static assets: `public/`). Thiết lập Worker `qbooks-management` với entry `src/worker.js` bằng Cloudflare CLI `cf` hoặc giao diện Workers.
4. Tạo **secret `SETUP_KEY`** ngẫu nhiên dài; không đưa vào GitHub. Áp dụng `schema.sql` vào D1.
5. Khởi tạo quản trị một lần bằng `POST /api/setup` body `{"setupKey":"…","email":"…","name":"Admin","pin":"mã PIN 6-12 số"}` (chỉ khi chưa có user).
6. Kiểm tra Worker trong môi trường thử nghiệm: đăng nhập, tạo đơn mẫu, upload ảnh/video, xác nhận R2 và D1; sau đó mới nhập dữ liệu thật.
7. Tên `qbook.quantri.page.com` chỉ dùng được nếu người sử dụng có quyền kiểm soát vùng DNS `quantri.page.com` hoặc `page.com` tương ứng trên Cloudflare. Hiện chưa xác thực được. Dùng hostname Workers mặc định khi thử nghiệm.

## Giới hạn
- Video tối đa 60 phút (kiểm tra metadata trên trình duyệt), dung lượng tối đa 2 GiB; ảnh tối đa 25 MiB.
- Mã PIN ngắn dễ bị đoán. MVP bắt buộc ít nhất 6 chữ số, khóa 15 phút sau 5 lần sai.
- Tệp được giữ riêng tư ở R2. Không bật public bucket. Tải xuống qua endpoint yêu cầu đăng nhập.
- Các bản export/migration từ `DATA_TONG`, `DM_NHAN_SU` vẫn cần đối chiếu và nghiệm thu riêng.

## Kiểm thử
Dùng `node --test` để chạy kiểm thử các hàm thuần trong `src/domain.js`.

## Tài liệu Cloudflare
- [Workers](https://developers.cloudflare.com/workers/)
- [Multipart R2](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [D1](https://developers.cloudflare.com/d1/)
