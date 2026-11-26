# QBooks app cho iOS và Android

App là lớp vỏ native (Capacitor 8) mở trang https://qbooks-quantri.pages.dev. Vì vậy:

- Mọi thay đổi trên web (merge vào `main`, Cloudflare Pages cập nhật) **tự có trong app**, không cần build lại hay chờ duyệt store.
- Chỉ build lại app khi sửa thư mục `mobile/` (icon, quyền camera, tên app…) hoặc muốn đưa bản mới lên store.

| | Thông tin |
|---|---|
| Tên app | QBooks |
| Mã app (bundle id / applicationId) | `vn.qbooks.quantri` |
| Android tối thiểu | Android 7.0 (API 24) |
| iOS tối thiểu | iOS 15 |
| Quyền | Camera, micro (quay video 720p, chụp ảnh), thư viện ảnh |

Trong app, trang web nhận biết qua user agent `QBooksApp/…`. Ở chế độ này trang sẽ:
- Đăng nhập bằng email + PIN. Google không cho đăng nhập bên trong app nhúng, nên nút Google được thay bằng hướng dẫn.
- Giữ màn hình sáng trong lúc đang tải video. Tính năng này cũng chạy trên trình duyệt có hỗ trợ.

## Build tự động (GitHub Actions → "Mobile apps (iOS & Android)")

Workflow chạy khi `mobile/**` thay đổi. Có thể chạy tay: tab **Actions → Mobile apps → Run workflow**.

### Android
- Luôn tạo `QBooks-1.0.N-cai-truc-tiep.apk`. Tải về ở phần **Artifacts** của lần chạy, gửi qua Zalo hoặc Drive, rồi cài trực tiếp trên máy Android (cần cho phép "Cài ứng dụng không rõ nguồn gốc"). Không cần Google Play.
- Bản cho Google Play (`.aab` đã ký) được tạo khi có 4 secret trong **Settings → Secrets and variables → Actions**:
  - `ANDROID_KEYSTORE_BASE64`: file keystore đã mã hóa base64 (`base64 -w0 qbooks.jks`)
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`

  Tạo keystore một lần, cất giữ cẩn thận. Mất keystore thì không cập nhật được app trên Google Play:
  `keytool -genkey -v -keystore qbooks.jks -keyalg RSA -keysize 2048 -validity 10000 -alias qbooks`

### iOS
- Mỗi lần chạy, workflow build thử cho iOS Simulator để chắc project biên dịch được. Bước này không cần tài khoản Apple.
- Để cài lên iPhone thật thì phải qua **TestFlight** hoặc App Store, và cần **Apple Developer Program** (99 USD/năm):
  1. Tạo app trên App Store Connect với bundle id `vn.qbooks.quantri`.
  2. Tạo App Store Connect API key (Users and Access → Integrations → Keys, quyền App Manager).
  3. Thêm các secret: `APPLE_TEAM_ID`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_API_KEY_P8` (nội dung file .p8).
  4. Chạy workflow bằng tay, tick **Upload the iOS build to TestFlight**. Bản build xuất hiện trong TestFlight sau khoảng 10–30 phút. Mời nhân viên bằng email hoặc link công khai.

## Build trên máy cá nhân (tùy chọn)
```bash
cd mobile && npm ci && npx cap sync
npx cap open android   # Android Studio
npx cap open ios       # Xcode (cần máy Mac)
npm run icons          # tạo lại icon/splash từ mobile/assets/
```
