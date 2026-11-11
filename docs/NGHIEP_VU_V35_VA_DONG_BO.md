# Đối chiếu nghiệp vụ QBooks – nguồn Apps Script V35 (đọc 11/11/2026)

## Nguồn sự thật
- Apps Script **version 35**: `1Musiz52COY-menq43yDbSEbsjeTiXJ21fatG7pOt9aAai-Jfz7Ahsw63` (chỉ đọc).
- Google Sheets: `1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw`.
- Drive: `CAU_HINH!B3` xác định thư mục gốc `DON_HANG` (không sao chép quyền truy cập thư mục).
- LƯU Ý: `DATA_TONG` có **hai cột cùng nhãn THOI_GIAN_GOM** (AN và AO), và `NHA_XE_SALE` tại AP. **Dùng vị trí cố định + mã ID** khi đọc, không dùng dictionary ghi theo nhãn trùng.
- Sheet hiện có: `SALE_DONG_DON`, `SALE_GOP_VAN_DON`, `DATA_TONG`, `DM_NHAN_SU`, `DM_THONG_TIN`, `CAU_HINH`, `LOG`.

## Quy trình nghiệp vụ chính
| Khâu | Nguồn và thao tác gốc | Bắt buộc khi tái dựng |
|---|---|---|
| Sale nhập | `SALE_DONG_DON` B:I; H nhà xe tùy chọn; I tên người nhập đối chiếu `DM_NHAN_SU!I:J`; tích J để ghi một bản ghi `DATA_TONG` | Giữ dữ liệu nguồn, xác minh cột bắt buộc B:G,I; chống trùng **từng mã hóa đơn** trong chuỗi phân tách dấu phẩy; một dòng dù nhiều mã; nhật ký và tác giả thật |
| Sale gộp | `SALE_GOP_VAN_DON!A2:A` chọn `NOI_DUNG_GOC`, tích B2; sinh `VD_yyyyMMdd_HHmmss_xxxx` | Không gộp đơn đã hoàn thành, có nhóm hoặc đã có mã vận đơn; ghi `NHOM_VAN_DON`, người/thời gian gộp |
| Danh sách | Màn hình Đóng hàng chỉ `CHỜ ĐÓNG HÀNG`, Vận đơn chỉ `CHỜ VẬN ĐƠN` (nhóm đơn/đơn lẻ); tìm mã hóa đơn, khách, sale, nội dung gốc | Phân quyền, khóa đơn chống thao tác đồng thời; danh sách nhân sự từ sheet; giữ id `DON_yyyyMMdd_NNNN` |
| Đóng hàng | Ảnh hóa đơn, video tối đa 60 phút/2 GiB, ảnh hàng hóa; số thùng, nhiều người đóng cùng, ghi chú | Chỉ một nút `LƯU VÀ ĐÓNG HÀNG`; xác thực upload đủ mới cập nhật trạng thái; thư mục Drive theo `DON_HANG/{ID_DON}_{MA_HOA_DON}/DONG_HANG/{01_ANH_HOA_DON,02_VIDEO_DONG_HANG,03_HANG_HOA}` |
| Vận đơn | Một hoặc nhiều đơn/nhóm; Loại ship `Ship ruột`, `Kiot`, `App`; SĐT ship, tên ship (bắt buộc khi Ship ruột); tiền ship, hàng nặng, phí bến, phụ phí, tổng tiền; ghi chú; ảnh bàn giao | Ràng buộc nhóm, kiểm tra tiền không âm, tổng = 4 khoản; `ĐANG GIAO` hoặc `HOÀN THÀNH`; Drive `GIAO_HANG` |
| Quản trị | `DATA_TONG`, `LOG`, `DM_NHAN_SU`; PIN 3–8 chữ số, email, họ tên, trạng thái, nhiều quyền `DONG_HANG,VAN_DON,ADMIN` cùng lúc | Không được ép 1 người vào duy nhất 1 vai trò; giữ login Google và PIN độc lập |
| Xung đột | Script khóa đơn theo người trong 6 giờ, yêu cầu khóa trước upload hoặc lưu | Khóa D1 có TTL, log lấy/trả khóa; server kiểm tra khóa khi lưu và tải tệp |

## Google Sheets DATA_TONG
A:AP có 42 cột, đặc biệt:
- A `ID_DON`, B `NOI_DUNG_GOC`, C `GAP`, D `MA_HOA_DON`, E `LOAI_VAN_CHUYEN`, F `TEN_KHACH`, G `SO_QUYEN`, H `DIA_CHI`, I `USER_TAO`, J `THOI_GIAN_TAO`;
- K `LINK_THU_MUC_DONG_HANG`, L `GHI_CHU_DONG_HANG`, M `USER_DONG_HANG`, N `THOI_GIAN_DONG_HANG`;
- O `NGUOI_GIAO_HANG`, P `SDT_GIAO_HANG`, Q `MA_KIOT`, R `NHA_XE`, S `MA_VAN_DON`, T `GHI_CHU_VAN_DON`, U `LINK_THU_MUC_GIAO_HANG`, V `USER_VAN_DON`, W `THOI_GIAN_VAN_DON`;
- X `TRANG_THAI`, Y `CAP_NHAT_CUOI`, Z `LINK_ANH_HOA_DON`, AA `LINK_VIDEO_DONG_HANG`, AB `LINK_HANG_HOA`, AC `SO_THUNG`, AD `NGUOI_DONG_CUNG`;
- AE `LOAI_SHIP`, AF `TIEN_SHIP`, AG `HANG_NANG`, AH `PHI_BEN`, AI `PHU_PHI`, AJ `TONG_TIEN`;
- AK `TEN_SALE`, AL `NHOM_VAN_DON`, AM `USER_GOM_DON`, AN `THOI_GIAN_GOM`, AO `THOI_GIAN_GOM` (trùng nhãn), AP `NHA_XE_SALE`.

## Nguyên tắc kết nối và đồng bộ
1. **Đọc một chiều** Google Sheet → D1, đối chiếu theo ID_DON. Không tạo ID_DON mới khi import; không ghi spreadsheet hoặc làm thay đổi Apps Script V35.
2. **Ghi hai chiều** chỉ sau khi nghiệm thu: Cloudflare → cầu nối Apps Script chạy dưới tài khoản chủ sở hữu (vì DATA_TONG được bảo vệ). Cần khóa, phiên bản dữ liệu, xác nhận quyền, nhật ký, idempotency key, xác nhận thao tác.
3. Ảnh/video: R2 dùng để upload ổn định (giữ bí mật, không công khai). Muốn Drive vẫn chứa hồ sơ như bản cũ, cần worker/bridge được cấp OAuth `drive.file` hoặc một dịch vụ chuyển file được ủy quyền; **không thể tự động xuất hiện trên Drive khi chỉ lưu R2**.
4. Không lấy Google ID Token thay cho quyền truy cập Google Sheets/Drive: cần OAuth access token được cấp phạm vi phù hợp hoặc bridge sở hữu quyền Google.
5. Chỉ đối chiếu `ID_DON`, `CAP_NHAT_CUOI` và fingerprint bản ghi. Không ghi đè khi dữ liệu đã thay đổi ở phía Google; yêu cầu xử lý xung đột.
6. Doanh nghiệp đang dùng thực tế: ưu tiên chạy song song, chỉ bật ghi sau xác nhận thủ công từ quản trị; không xuất PIN người dùng ra API.
