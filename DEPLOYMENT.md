# Kế hoạch triển khai thử nghiệm Qbooks

## Trạng thái hạ tầng ngày 10/11/2026
- GitHub: `truongtho6699/Qbooks.management` (repository công khai, có quyền ghi).
- Cloudflare có hai tài khoản đang kết nối: `locphat` và tài khoản cá nhân.
- **R2 đã được kích hoạt trên tài khoản cá nhân** và bucket riêng `qbooks-media` (Standard, APAC) đã tạo thành công ngày 10/11/2026.
- Chưa thấy DNS zone `quantri.page.com` trong hai tài khoản; **không thể xác nhận `qbook.quantri.page.com` là tên miền thuộc quyền quản lý**.
- **D1 `qbooks-db` đã được tạo**, mã CSDL: `17474d4c-8980-4c97-afb4-c52303b10325`; cấu trúc `schema.sql` đã được áp dụng, xác minh đủ 7 bảng nghiệp vụ. Worker và giao diện chưa triển khai; chưa chạm Apps Script V35 hay Google Sheets thực tế.

## Hạ tầng cần cấp
| Công cụ | Tên gợi ý | Binding |
| --- | --- | --- |
| Workers | `qbooks-management` | API + giao diện |
| D1 | `qbooks-db` | `DB` |
| R2 | `qbooks-media` | `MEDIA` |
| Static Assets | thư mục `public/` | `ASSETS` |
| Worker Secret | `SETUP_KEY` | mã thiết lập một lần |

**Lưu ý:** Với repo mới, dùng Cloudflare CLI `cf` và tài liệu hướng dẫn [cf CLI](https://developers.cloudflare.com/cf/agents/index.md); không cấu hình nhầm binding của cơ sở dữ liệu `ban1` hoặc `locphat-ai-db` đang dùng cho công việc khác.

## Triển khai sau khi bật R2
1. **Đã xong:** Dùng tài khoản Cloudflare cá nhân, R2 và D1 riêng cho QBooks.
2. **Đã xong:** R2 `qbooks-media` đã được tạo. Không bật public bucket, không tạo khóa tài khoản R2 trên frontend.
3. **Đã xong:** D1 `qbooks-db` đã được tạo tại APAC, schema đã áp dụng đúng database.
4. Tạo Worker từ `src/worker.js`, gắn R2 `MEDIA`, D1 `DB`, Static Assets `ASSETS` trỏ `public/`.
5. Tạo secret `SETUP_KEY` là chuỗi ngẫu nhiên dài (không commit lên GitHub).
6. Dùng `POST /api/setup` để tạo quản trị khi chưa có nhân sự nào.
7. Thử nghiệm theo ca:
   - Sale tạo 2 đơn, kiểm tra tên: `HD0011 - Sale: Admin`.
   - Sale tạo 1 nhóm vận đơn gồm 2 đơn.
   - Đóng hàng tải ảnh và video 15 phút trên Wi-Fi; ngắt mạng giữa chừng rồi tiếp tục.
   - Kiểm tra R2 đủ dung lượng, D1 ghi trạng thái, không phát sinh tệp lặp.
   - Vận đơn chọn đơn chờ, tải ảnh, bấm Lưu vận đơn.
   - Thử cùng tệp trên Zalo iOS/Safari, kiểm tra lỗi CORS đã được loại bỏ do tải tệp cùng nguồn qua Worker.
8. Đối chiếu dữ liệu lịch sử Google Sheets `DATA_TONG` và quyền nhân sự từ `DM_NHAN_SU`, lên kế hoạch nhập dữ liệu theo từng lô. **Không kết nối hay ghi đè Google Sheet cũ tự động.**
9. Chỉ sau nghiệm thu mới chuyển đường dẫn truy cập của nhân viên từ Apps Script sang Worker.

## Về tên miền
`qbook.quantri.page.com` là một hostname cần quyền quản lý vùng DNS cấp trên. Chỉ cấu hình được khi người dùng sở hữu hoặc được phân quyền DNS thích hợp. Nếu chưa, thử trên hostname `*.workers.dev`; sau đó dùng tên miền thật đã xác nhận.

## Giới hạn cần kiểm thử
- Worker nhận từng phần 8 MiB dưới cùng hostname, truyền dạng stream tới R2 (không base64, không qua Apps Script).
- Mọi phần trừ phần cuối của video có cùng kích thước, từ 5 MiB trở lên theo R2.
- Tệp video tối đa 2 GiB và 60 phút (trình duyệt kiểm tra thời lượng; backend giới hạn kích thước).
- Thông tin đăng nhập chỉ lưu trên D1 dưới dạng hàm dẫn xuất PBKDF2 có muối; PIN 3–12 chữ số (khuyến nghị từ 6); chặn 15 phút sau năm lần sai.
- Trước triển khai sản xuất cần kiểm thử tải file đầy đủ, phân quyền nhiều người dùng, thao tác đồng thời, sao lưu D1/R2 và bảo vệ thông tin khách hàng.

## Cấu hình Pages Functions (11/11/2026)
- Pages project: `qbooks-quantri`; GitHub `main`, output `public`.
- Binding production/preview: `DB` → `qbooks-db`, `MEDIA` → `qbooks-media`.
- Route API qua `functions/api/[[path]].js`; static assets từ `public/`.
- Dự án này độc lập với Apps Script V35. Chưa thiết lập tài khoản quản trị hay nhập dữ liệu thật.

## Đã triển khai Pages 11/11/2026
- Pages: https://qbooks-quantri.pages.dev/ (GitHub main, nhánh triển khai tự động).
- API Functions: `functions/api/[[path]].js`, endpoint kiểm tra: `/api/health`.
- Pages Production/Preview bindings: `DB` => `qbooks-db`, `MEDIA` => `qbooks-media`.
- Build GitHub Actions đã thành công; Cloudflare Pages xác nhận giai đoạn build/deploy thành công.
- **Chưa cấu hình secret `SETUP_KEY`**. Chủ dự án phải vào Pages → Settings → Variables and Secrets, tạo secret ngẫu nhiên dài tên `SETUP_KEY`, sau đó redeploy. Chỉ khi có secret mới dùng biểu mẫu Khởi tạo quản trị lần đầu, nhập email/tên và đặt mã PIN riêng.
- Chưa thử ảnh/video thực tế trên iPhone/Zalo, chưa nhập dữ liệu thật từ Google Sheets. Ứng dụng cũ V35 không thay đổi.
