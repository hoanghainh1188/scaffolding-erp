# Runbook: vận hành dữ liệu cá nhân

Quyết định gốc: `docs/requirements.md` 0.2 #156–#167. Thiết kế: change `personal-data-protection`.

## 1. Khóa mã hóa

- Biến `PII_ENCRYPTION_KEYS`, dạng `2:<base64>,1:<base64>`. Khóa đầu mã hóa, mọi khóa giải mã. Sinh khóa: `openssl rand -base64 32`.
- Mỗi công ty (mỗi DB, mỗi bản deploy) một khóa riêng.
- Đặt ở: Vercel Production và secret `PROD_PII_ENCRYPTION_KEYS` của environment `production`. Không tải về máy cá nhân.
- **Cất một bản trong kho mật khẩu của công ty, tách khỏi nơi cất bản sao lưu** và tách khỏi `BACKUP_ENCRYPTION_KEY`. Hai người giữ: chủ repo và Giám đốc.
- **Mất khóa là mất hết CCCD và hồ sơ thuế**, không khôi phục được.
- Sau khi đặt khóa mới, kiểm tra trên staging: lưu một CCCD số bắt đầu `000`, mở lại form sửa, thấy đúng số.

## 2. Đổi khóa

Chu kỳ 12 tháng, hoặc ngay khi nghi lộ.

1. Thêm khóa mới **đứng đầu**: `2:<mới>,1:<cũ>`, ở cả Vercel và GitHub Secret. Deploy lại.
2. Actions → **Personal Data Maintenance** → `rotate`.
3. Chạy `rotate-check`: phải báo còn 0.
4. Bỏ khóa cũ khỏi biến. Deploy lại.
5. **Giữ khóa cũ ở kho mật khẩu tới khi bản sao lưu dùng khóa đó hết hạn** (tối thiểu 30 ngày).

Trong lúc chuyển, app đọc được cả hai khóa nên không phải dừng.

## 3. Chuyển dữ liệu cũ (chỉ một lần)

1. `db:migrate` chỉ thêm cột. Đặt `PII_ENCRYPTION_KEYS` **trước** khi deploy (thiếu là không khởi động).
2. Deploy, kiểm tra bản mới chạy đúng.
3. Workflow `backfill`, rồi `backfill-check` phải báo còn 0.
4. Xóa nhánh Neon `pre-deploy-*` có từ trước backfill. Xác nhận bản sao lưu cũ đã hết hạn (30 ngày) trước khi đưa dữ liệu thật lên.
5. PR bước 2 bỏ hai cột cũ, chỉ sau khi mọi môi trường có dữ liệu đều báo 0.

## 4. Người bán yêu cầu xóa

Hạn: **trả lời trong 2 ngày làm việc, làm xong trong 20 ngày** từ ngày nhận.

1. Ghi vào **sổ yêu cầu xóa** (bảng tính ngoài DB, cất cùng hồ sơ tuân thủ): ngày nhận, mã NCC, người tiếp nhận, hạn. Không ghi CCCD.
2. Kế toán xử lý hết nợ, tiền ứng trước, đơn đang chạy.
3. Giám đốc: D16 → người bán → **Ẩn danh theo yêu cầu**, nhập mã NCC và ngày nhận yêu cầu.
4. Trả lời người yêu cầu. Nếu đã từng nhập hàng: nói rõ tên, địa chỉ, CCCD còn được giữ mã hóa cho nghĩa vụ thuế tới hết thời hạn.
5. Ghi ngày hoàn thành vào sổ.

Ghi chú tự do trên đơn mua, phiếu chi có thể chứa tên: phần mềm không quét được. Khi có yêu cầu xóa, Kế toán rà tay các chứng từ của người đó.

## 5. Hồ sơ thuế của người đã ẩn danh

- Tên, địa chỉ, CCCD nằm trong một gói mã hóa; **hiện chưa có màn hình hay lệnh nào đọc được**.
- Cơ quan thuế yêu cầu thì phải mở change riêng để có đường đọc. Khóa cũ phải còn thì mới đọc được.

## 6. Thời hạn giữ và lệnh dọn

- Mặc định 10 năm từ lần nhập gần nhất (`ID_NUMBER_RETENTION_YEARS`, chờ luật sư, #78). Chưa từng nhập thì từ ngày tạo.
- Workflow `purge` **mỗi năm một lần**. Lệnh xóa gói hồ sơ thuế và CCCD đã quá hạn, chạy lại không đổi gì.
- Người bán quay lại sau khi đã xóa CCCD: Kế toán nhập lại số.

## 7. Bằng chứng tuân thủ

Sau **mỗi lần chạy** `pii-maintenance` (backfill, rotate, purge): tải log của lần chạy, lưu vào hồ sơ tuân thủ, vì log GitHub có hạn. Log chỉ có số dòng, không có dữ liệu cá nhân. Thấy dãy 12 chữ số trong log thì xử lý như sự cố (`data-breach.md`).

## 8. Khôi phục bản sao lưu

Bản sao lưu cũ có thể chứa người đã ẩn danh sau ngày sao lưu.

1. Khôi phục theo `production.md` Sự cố 4. Phải có khóa còn hiệu lực lúc sao lưu.
2. **Trước khi mở cho người dùng:** đối chiếu sổ yêu cầu xóa, ẩn danh lại từng người có ngày hoàn thành sau ngày của bản sao lưu.
3. Ghi việc đã làm vào sổ.

## 9. Nhà thầu cá nhân yêu cầu xóa (xử lý tay, 0.2 #167)

Phần mềm chỉ có nút ẩn danh cho người bán. Với nhà thầu:

1. Ghi sổ yêu cầu xóa như mục 4, cùng hạn.
2. Kiểm hết nợ và mọi hợp đồng đã thanh lý.
3. D16: đổi tên thành `Đã ẩn danh (<mã NT>)`; xóa người liên hệ, điện thoại, địa chỉ, ghi chú; Ngừng dùng.
4. **Báo luật sư (#78) trước khi trả lời người yêu cầu.** Giá trị cũ **vẫn còn trong nhật ký**, kể cả dòng của chính lần sửa này, và hợp đồng đã duyệt vẫn giữ nguyên.
