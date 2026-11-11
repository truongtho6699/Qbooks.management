# Kết nối Google Sheets/Drive với QBooks Cloudflare — 11/11/2026

## Trạng thái đã triển khai
- Cloudflare Pages: https://qbooks-quantri.pages.dev/
- Nguồn nghiệp vụ: Apps Script V35 (KHÔNG chỉnh sửa), Sheet `1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw`.
- Các tab thực tế: `SALE_DONG_DON`, `SALE_GOP_VAN_DON`, `DATA_TONG`, `DM_NHAN_SU`, `DM_THONG_TIN`, `CAU_HINH`, `LOG`.
- Đã kiểm tra nguồn: 15 đơn, 8 chờ đóng, 5 chờ vận đơn, 2 hoàn thành, 5 có nhóm, 2 đa mã hóa đơn. Không ghi lại dữ liệu nguồn.
- Google OAuth đang dùng Client ID công khai đã cài trong Pages Production; login Google và xin quyền đọc Google Sheets là **hai quyền khác nhau**.

## Đọc Google Sheets bằng OAuth người dùng (không cần sửa Apps Script)
1. Vào [Google Cloud Console – APIs](https://console.cloud.google.com/apis/library/sheets.googleapis.com), **bật Google Sheets API** trên dự án có Client ID đang dùng.
2. Vào [Google Auth Platform – Audience](https://console.cloud.google.com/auth/audience), bổ sung tài khoản Google của quản trị vào Test users nếu ứng dụng còn Testing. Nếu Google yêu cầu xác minh cho phạm vi nhạy cảm, cần hoàn tất yêu cầu theo chính sách Google trước khi mở cho đại trà.
3. Mở QBooks, đăng nhập tài khoản Admin.
4. Tab **Quản trị → Đọc Google Sheets bằng Google (chỉ đọc)**.
5. Google sẽ hỏi quyền `https://www.googleapis.com/auth/spreadsheets.readonly`. Chỉ chọn tài khoản có quyền truy cập bảng gốc; chấp nhận sẽ hiển thị bản xem trước đơn, nhân sự (A:F, không có PIN) và nhóm.
6. Token truy cập chỉ giữ trong bộ nhớ trang đang mở, không lưu vào D1/localStorage; chưa có thay đổi nào trong Google Sheets.

## Nhập một chiều Google Sheets → D1 (cần xác nhận trong giao diện)
1. Sau khi đọc, kiểm tra tổng đơn và trạng thái hiển thị.
2. Tích xác nhận "chỉ nhập vào D1; không ghi Google Sheets hoặc Drive".
3. Bấm **NHẬP DỮ LIỆU ĐÃ ĐỐI CHIẾU VÀO D1**.
4. Worker **tự gọi Google Sheets API** với quyền đọc tạm thời của người dùng để lấy lại dữ liệu trực tiếp từ Google, kiểm tra tiêu đề A:AP và từng dòng. Không tin dữ liệu tùy ý do trình duyệt gửi lên.
5. Nhập/tăng bản ghi theo `ID_DON`: mới thì thêm, trùng và chưa đổi thì bỏ qua, bản ghi phát sinh nội bộ/đã sửa trên D1 thì báo xung đột và **không ghi đè**.
6. D1 bảo toàn bản gốc 42 cột và lưu dấu người nhập, thời gian tạo, trạng thái, chi phí, nhóm, liên kết Drive. Danh mục nhân sự chỉ lưu email, tên, quyền cờ và trạng thái, **không lưu PIN**.
7. Sau khi nhập, quay lại tab Đóng hàng hoặc Vận đơn để xem đơn và thao tác trên D1.

## Kiểm tra Google Drive
1. Bật [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) trong dự án Google Cloud.
2. Sau khi đọc Sheet, bấm **Kiểm tra thư mục Drive (chỉ đọc)**.
3. Cấp phạm vi `https://www.googleapis.com/auth/drive.metadata.readonly` để đọc tên/loại thư mục `DON_HANG` tại `CAU_HINH`.
4. Chức năng này chỉ đọc metadata; **không tải file từ R2 sang Drive** và không thay đổi quyền thư mục.

## Bắt buộc lưu ý
- **KHÔNG CÓ đồng bộ D1 → Google Sheets/Drive** ở giai đoạn này. Khi bấm Lưu đóng hàng/vận đơn trên QBooks, chỉ D1 và R2 thay đổi. Website sẽ cảnh báo rõ.
- Trước khi bật ghi hai chiều, phải tạo cầu nối mới do chủ sở hữu Sheet cấp quyền (xem `integrations/apps-script-bridge/Code.gs` cho mẫu đọc), bổ sung các hàm ghi có xác thực, khóa và kiểm tra xung đột; test trên bản sao của Sheet. Không sửa trực tiếp Apps Script V35 đang chạy.
- Để lưu ảnh/video trên Drive song song R2 cần ủy quyền Drive chuyên biệt và quy trình upload resumable. Video 2 GiB **không thể chỉ gửi một lần qua Apps Script UrlFetch**.
- `DATA_TONG` có hai tiêu đề `THOI_GIAN_GOM` liên tiếp (AN, AO). Mapping dùng vị trí cột để tránh mất dữ liệu.
- Nhân sự có thể đồng thời có quyền Đóng hàng và Vận đơn. D1 lưu cờ quyền, nhưng **danh mục từ Sheet không tự tạo tài khoản đăng nhập**.
- Đảm bảo phân quyền truy cập bảng Google và Cloudflare đủ chặt trước khi đưa công khai; hạn chế người truy cập Admin.
- Dữ liệu khách hàng và thông tin nhân sự không được đưa vào repo GitHub công khai.

## Kế hoạch ghi hai chiều (chưa kích hoạt)
- Ghi đóng hàng/vận đơn qua Apps Script cầu nối **riêng**, chạy bằng tài khoản có quyền trên `DATA_TONG`; xác thực server-to-server và hạn chế IP/ngữ cảnh nếu có.
- `ID_DON` và `CAP_NHAT_CUOI` là khóa đối chiếu, kèm fingerprint và mã yêu cầu để chống ghi trùng, kiểm tra trạng thái trước cập nhật.
- Khi ghi thành công cập nhật liên kết Drive về `LINK_*`, lưu nhật ký `LOG` và `sync_journal`, đặt `local_dirty=0`; khi lỗi giữ `local_dirty=1` để đối chiếu lại, **không giả vờ đồng bộ thành công**.
- Drive: thư mục theo `DON_HANG/{ID_DON}_{MA_HOA_DON}/DONG_HANG/{01_ANH_HOA_DON,02_VIDEO_DONG_HANG,03_HANG_HOA}` và `GIAO_HANG`.
