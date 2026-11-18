# Qbooks Media Hub V2 — Google Drive là kho lưu trữ chính (nhánh thử nghiệm)

Ngày: 18/11/2026. Chính sách **A: giữ toàn bộ video gốc, hậu kỳ và bản phát hành lâu dài**, không tự động xóa Google Drive sau khi phát hành YouTube. YouTube là kênh phát hành, không phải bản sao lưu.

## Phạm vi mã nguồn hiện tại
- Đã bổ sung tuyến **Đóng hàng/Vận đơn** upload trực tiếp vào Google Drive, **không ghi R2** khi `DRIVE_DIRECT_ENABLED=true`.
- Kỹ thuật: trình duyệt → Cloudflare Worker (truyền tiếp khối 8 MiB) → Google Drive resumable API; không đưa Google OAuth token hoặc phiên Drive vào trình duyệt. Đây là **tải thẳng vào Drive qua Worker**, không phải browser → Google Drive trực tiếp. Cách này bảo đảm xác thực Qbooks và tránh phụ thuộc CORS phiên Google, nhưng vẫn tiêu thụ băng thông Worker.
- Mặc định `DRIVE_DIRECT_ENABLED` vắng hoặc false, giữ nguyên upload R2 trong ứng dụng.
- Migration `0018_drive_direct_backend.sql` thêm `uploads.storage_backend`, mặc định R2, không chỉnh sửa các bản ghi lịch sử. Chỉ khi áp dụng migration trên **D1 thử nghiệm** mới bật flag.
- Worker R2 đồng bộ cũ được lọc `storage_backend='R2'` để không tìm cách đồng bộ hoặc xóa tệp đã lưu trực tiếp vào Drive.
- Đọc lại file ID, dung lượng, MIME, parent folder, qbooksUploadId và trạng thái trash từ Google trước khi đánh dấu `COMPLETE`.
- Client hỗ trợ tải tiếp từ offset Google trả về; lưu ID phiên ở localStorage. Khóa đơn và phân quyền vẫn được kiểm tra.
- Chưa mở rộng upload trực tiếp cho mục Quay/Hậu kỳ của hệ thống Media; các trường Drive/YouTube hiện có vẫn được giữ, chưa tự động đăng video YouTube.

## Điều kiện kiểm thử bắt buộc, KHÔNG kích hoạt Production trước nghiệm thu
1. Tạo **D1 thử nghiệm tách biệt Production**; không dùng D1 Production trong Preview. Sao chép cấu trúc schema và áp dụng migration 0018 ở D1 thử nghiệm.
2. Triển khai nhánh riêng vào môi trường thử nghiệm với D1 tách biệt, R2 tách biệt hoặc tắt chức năng R2 cũ trong Preview. Không tự gắn cấu hình Production cho Preview.
3. Cấp OAuth ngoại tuyến cho **Pages/Worker phục vụ API ứng dụng**: `GOOGLE_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Secret chỉ ở Cloudflare; KHÔNG đặt vào GitHub hoặc chat. Token phải có quyền Drive API và tài khoản phải có quyền thêm tệp vào thư mục đơn hàng cũ và thư mục lưu trữ video. Credential Cron Worker cũ không tự động xuất hiện trong Pages.
4. Chỉ bật `DRIVE_DIRECT_ENABLED=true` ở môi trường thử nghiệm.
5. Thử ảnh dưới 25 MiB và video dưới 2 GiB; ngắt mạng giữa chừng rồi tiếp tục; kiểm tra tệp thực tế trên Drive, ID, bytes, MIME, folder, appProperties; mở lại tệp. Thử tài khoản không có quyền, upload sai stage, sai offset, phiên hết hạn, 2 người cùng tải một đơn, lỗi quyền Google, đầy dung lượng.
6. Đối chiếu đơn và nội dung upload R2 cũ; chạy regression Sale → Đóng hàng → Vận đơn. Kiểm tra không xóa tệp cũ, không lẫn dữ liệu D1 giữa Preview và Production.
7. Chỉ tạo quyết định chuyển Production sau khi các ca kiểm thử và công cụ rollback đã đạt. Chưa áp dụng migration, chưa bật flag và chưa thay đổi Cloudflare Production trong đợt này.

## Chính sách lưu trữ A
- Video gốc, bản đã chỉnh sửa, phiên bản xuất và bản YouTube cuối cùng đều phải được giữ trên Drive theo thư mục đầu sách/bài/phiên bản. Không có tác vụ tự động dọn hoặc xóa.
- Trường URL YouTube phải lưu cùng metadata video, trạng thái phát hành và người phát hành. Tính năng đẩy YouTube tự động là một giai đoạn khác, cần quyền YouTube riêng và nghiệm thu.
- Drive là kho vận hành chính, **không phải một bản sao dự phòng độc lập**. Khuyến nghị sao lưu định kỳ sang nơi khác để tránh xóa nhầm, sự cố tài khoản hoặc ransomware.

## Rollback
- Đặt `DRIVE_DIRECT_ENABLED=false` để **các lượt upload mới** quay về R2.
- Giữ bản ghi `storage_backend='DRIVE'`, không chuyển ngược hoặc xóa tệp Drive đã tạo; upload đang dở phải được giải quyết/tiếp tục bằng nhánh V2 trước khi hoàn tất.
- Không rollback migration bằng cách xóa cột; giữ lịch sử để kiểm tra.

## Còn cần hoàn thiện trước Production
- Kiểm chứng chức năng tải trực tiếp trên một môi trường Preview có dữ liệu thử và Google OAuth đã cấp.
- Bổ sung quản lý media nguồn quay/hậu kỳ trực tiếp qua Drive, gắn với `video_items` (phân quyền FILM/EDIT, phiên bản video, link file) và tích hợp YouTube phát hành theo phê duyệt.
- Đo tốc độ, khả năng xử lý file 2 GiB và ổn định/khôi phục phiên khi worker bị timeout.


## Rà soát Cloudflare 18/11/2026 — rủi ro Preview dùng chung Production
- Đã đọc cấu hình `qbooks-quantri`: **Preview DB ID = Production DB ID** (`17474d4c-8980-4c97-afb4-c52303b10325`); Preview bucket **qbooks-media = Production qbooks-media**. Không được chạy thử Preview trên binding hiện tại.
- `preview_deployment_setting=none`, hiện chưa được bật nhánh xem thử. Không tự đổi cấu hình hoặc tạo dữ liệu/bucket mới khi chưa xác nhận chi phí và phân tách.
- Chỉ tạo Preview sau khi có D1 thử nghiệm và (nếu cần test quy trình R2) bucket thử nghiệm, binding Preview không trỏ tài nguyên thật.
- Google OAuth của ứng dụng Pages Production chưa hiện có hai secret ngoại tuyến. Không sao chép secret bằng văn bản từ Worker Cron.
- Đã bổ sung kiểm thử giả lập hoàn chỉnh cho luồng POST phiên Drive → PUT đoạn → đối chiếu metadata → D1 COMPLETE; kiểm thử giả lập không thay thế nghiệm thu thật bằng tài khoản Google và Drive thử nghiệm.
