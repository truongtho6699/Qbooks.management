# Cấu hình Đăng nhập / Đăng ký bằng Google – QBooks

## Phạm vi
- Website: https://qbooks-quantri.pages.dev/
- Nút Google Identity Services (GIS), giao diện dạng popup.
- Backend Pages Functions xác minh **chữ ký JWT RS256 với Google JWKS**, issuer, audience (`GOOGLE_CLIENT_ID`), thời hạn token, email đã xác minh và Google `sub`.
- Không cần, không được thu thập Google Password, Google Client Secret hoặc khóa riêng trong GitHub.
- Người dùng đã được quản trị tạo trước với cùng email đã xác minh: Gmail/Google Workspace có thể liên kết bằng xác thực Google; email ngoài hai trường hợp này cần **Admin phê duyệt liên kết** để tránh chiếm quyền tài khoản cũ.
- Người dùng Google mới: tạo đăng ký `PENDING`, **không có quyền đọc đơn hay dữ liệu** cho đến khi Admin duyệt.
- Admin duyệt theo vai trò nghiệp vụ `SALE`, `PACKER`, `SHIPPER`. Không cho tự đăng ký quyền Admin.
- Login bằng PIN cũ vẫn hoạt động song song; D1 chỉ bổ sung cột/bảng, không xóa tài khoản.

## Bước 1 – Google Cloud
1. Mở https://console.cloud.google.com/ và chọn dự án Google Cloud thích hợp cho QBooks (hoặc tạo dự án riêng).
2. Mở **Google Auth Platform** → **Branding**, thiết lập tên ứng dụng, email hỗ trợ và các thông tin được yêu cầu.
3. Trong **Audience**, chọn Internal nếu chỉ nhân viên Google Workspace thuộc tổ chức; chọn External nếu dùng tài khoản Gmail cá nhân hoặc nhiều tổ chức. Nếu đang ở Testing, bổ sung email thử nghiệm.
4. Trong **Clients** → **Create client** → **Web application**.
5. **Authorized JavaScript origins**: nhập chính xác `https://qbooks-quantri.pages.dev`.
6. Với GIS ở chế độ popup và callback JavaScript, không cần Redirect URI cho luồng hiện tại. Nếu Google Console yêu cầu thêm cấu hình khác, đối chiếu tài liệu GIS trước khi khai báo.
7. Sao chép **Client ID**, định dạng `...apps.googleusercontent.com`. Không cần sao chép Client Secret vào QBooks.

## Bước 2 – Cloudflare Pages
1. Vào Cloudflare → Workers & Pages → Pages `qbooks-quantri` → **Settings → Variables and Secrets**.
2. Tạo biến thường (Plain text), tên **`GOOGLE_CLIENT_ID`**, giá trị Client ID từ Google Cloud, ở **Production**.
3. Để thử nghiệm trên các URL xem trước, đặt biến tại Preview tương ứng và khai báo các origin xem trước trên Google Cloud nếu dùng những hostname đó.
4. Lưu, **Redeploy** bản Production mới nhất để Pages Functions nhận biến.
5. Kiểm tra `https://qbooks-quantri.pages.dev/api/google/config` trả `enabled:true` và Client ID công khai.

## Bước 3 – Sử dụng
1. Mở `https://qbooks-quantri.pages.dev`, chọn **Tiếp tục bằng Google**.
2. Với tài khoản Gmail/Workspace đã được Admin tạo trước, ứng dụng liên kết Google sau khi xác minh Google là bên quản lý email; email ngoài Gmail/Workspace sẽ vào danh sách chờ phê duyệt liên kết.
3. Với tài khoản chưa được cấp quyền, ứng dụng báo **Đang chờ quản trị duyệt**.
4. Quản trị đăng nhập (PIN hoặc Google đã liên kết) → **Nhân sự** → **Đăng ký Google chờ duyệt** → với tài khoản mới chọn vai trò; với nhân sự có sẵn chỉ liên kết Google và **giữ nguyên quyền cũ**; hoặc từ chối.
5. Người đăng ký bấm Google lại để đăng nhập sau khi được duyệt.

## Nếu nút Google chưa xuất hiện
- `/api/google/config` là `enabled:false`: chưa cấu hình `GOOGLE_CLIENT_ID` đúng môi trường hoặc chưa redeploy.
- Lỗi `origin_mismatch`: kiểm tra Authorized JavaScript origins với đường dẫn mở (không có / cuối, đúng https).
- Lỗi `access_blocked` hoặc `app_not_configured`: kiểm tra Google Auth Platform → Branding / Audience / Testing Users.
- Nếu mở từ Zalo mà popup Google không hiển thị, thử Chrome hoặc Safari bên ngoài Zalo; **đăng nhập PIN luôn là dự phòng**.
- Nếu thông báo `Không lấy được khóa xác thực Google`, kiểm tra kết nối ra Google JWKS của Worker.

## Lưu ý bảo mật
- Không tự động cấp quyền khi người lạ sở hữu tài khoản Google.
- Google ID Token chỉ dùng để xác minh, không lưu trong database; ứng dụng tạo session QBooks riêng.
- Client ID là dữ liệu công khai, nhưng Client Secret, PIN và `SETUP_KEY` phải giữ bí mật.
- Sau khi xác nhận đăng nhập, quản trị nên gỡ `SETUP_KEY` khỏi Production và triển khai lại nếu không còn cần khởi tạo lần đầu.
