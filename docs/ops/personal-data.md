# Runbook: vận hành dữ liệu cá nhân

Quyết định gốc: `docs/requirements.md` 0.2 #156–#167. Thiết kế: change `personal-data-protection`.

## 1. Khóa mã hóa

- Biến `PII_ENCRYPTION_KEYS`, dạng `2:<base64>,1:<base64>`. Khóa đầu mã hóa, mọi khóa giải mã. Sinh khóa: `openssl rand -base64 32`.
- Mỗi công ty (mỗi DB, mỗi bản deploy) một khóa riêng.
- Đặt ở: Vercel Production và secret `PROD_PII_ENCRYPTION_KEYS` của environment `production-pii` (chủ repo duyệt từng lần chạy, chỉ từ `main`; environment `production` không giữ khóa này). Không tải về máy cá nhân.
- **Không dùng khóa mẫu** trong `.env.example` / CI: production từ chối khởi động với khóa đó.
- **Cất một bản trong kho mật khẩu của công ty, tách khỏi nơi cất bản sao lưu** và tách khỏi `BACKUP_ENCRYPTION_KEY`. Hai người giữ: chủ repo và Giám đốc.
- **Mất khóa là mất hết CCCD và hồ sơ thuế**, không khôi phục được.
- Sau khi đặt khóa mới, kiểm tra trên staging: lưu một CCCD số bắt đầu `000`, mở lại form sửa, thấy đúng số.

### Cài environment `production-pii` (chủ repo làm một lần)

Repo → Settings → Environments → **New environment** → `production-pii`:

1. **Required reviewers**: thêm người duyệt (chủ repo và một người nữa nếu có).
2. Bật **Prevent self-review**: người bấm chạy không tự duyệt được.
3. **Deployment branches and tags** → Selected branches → chỉ `main`.
4. **Environment secrets**: thêm `PROD_PII_ENCRYPTION_KEYS` và `PROD_DATABASE_URL` (role `erp_app`), như `production.md` mục 1.
5. Environment `production` → **xóa** secret `PROD_PII_ENCRYPTION_KEYS`. Giữ `PROD_DATABASE_URL` ở đó cho `backup.yml`, `inventory-check.yml`.

Workflow **Personal Data Maintenance** chỉ chạy trên `main`, dùng `production-pii`, action ghim theo SHA (test `src/lib/privacy/pii-workflow.test.ts`).

## 2. Đổi khóa

Chu kỳ 12 tháng, hoặc ngay khi nghi lộ.

1. Thêm khóa mới **đứng đầu**: `2:<mới>,1:<cũ>`, ở cả Vercel và secret của `production-pii`. Deploy lại.
2. Actions → **Personal Data Maintenance** → `rotate`.
3. Chạy `rotate-check`: phải báo còn 0. Khác 0 (gặp dòng đang bị khóa nên `rotate` dừng sớm) thì chạy lại `rotate`.
4. Bỏ khóa cũ khỏi biến. Deploy lại.
5. **Giữ khóa cũ ở kho mật khẩu tới khi bản sao lưu dùng khóa đó hết hạn** (tối thiểu 30 ngày).

Trong lúc chuyển, app đọc được cả hai khóa nên không phải dừng.

## 3. Chuyển dữ liệu cũ (đã xong, bước 2 đã bỏ cột cũ)

Bước 1 thêm cột mã hóa, lệnh `pii:backfill` chuyển `supplier.id_number`, `supplier.bank_account` sang cột mới rồi xóa trắng. Bước 2 (migration `0030_drop_legacy_pii`) bỏ hẳn hai cột cũ; lệnh `pii:backfill` và lựa chọn `backfill` của workflow không còn.

- Migration `0030` **dừng** nếu một dòng còn dữ liệu ở cột cũ (chỉ báo số dòng, không in số). Gặp lỗi đó: deploy lại bản bước 1 (commit trước PR bước 2), chạy `npm run pii:backfill`, rồi deploy lại bản mới.
- Xóa nhánh Neon `pre-deploy-*` có từ trước khi chuyển. Xác nhận bản sao lưu cũ đã hết hạn (30 ngày) trước khi đưa dữ liệu thật lên.
  - **Neon PITR** (khôi phục theo thời điểm): lịch sử của nhánh chính vẫn giữ CCCD dạng chữ thường tới hết cửa sổ khôi phục. Chờ hết cửa sổ (hoặc tạm giảm cửa sổ) rồi mới coi là sạch.
- Khôi phục một bản sao lưu có từ trước bước 2: bản đó còn hai cột cũ. Chạy `db:migrate`; nếu `0030` dừng thì làm như trên.

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

- Mặc định 10 năm (`ID_NUMBER_RETENTION_YEARS`, chờ luật sư, #78), tính từ ngày **muộn hơn** của: lần nhập hàng gần nhất và ngày lưu CCCD (`supplier.id_number_saved_at`, review PR #176 mục 5). Không có cả hai thì từ ngày tạo. CCCD vừa nhập lại cho người bán quay lại sau nhiều năm không bị xóa ngay.
- Workflow `purge` **mỗi năm một lần**. Lệnh xóa gói hồ sơ thuế và CCCD đã quá hạn, chạy lại không đổi gì.
- Không còn Giám đốc nào đang hoạt động thì `purge` thoát mã 1 (nhật ký cần một tài khoản thật, 0.2 #168): mở khóa hoặc tạo Giám đốc rồi chạy lại.
- Người bán quay lại sau khi đã xóa CCCD: Kế toán nhập lại số.

## 7. Bằng chứng tuân thủ

Sau **mỗi lần chạy** `pii-maintenance` (rotate, purge): tải log của lần chạy, lưu vào hồ sơ tuân thủ, vì log GitHub có hạn. Log chỉ có số dòng, không có dữ liệu cá nhân. Thấy dãy 12 chữ số trong log thì xử lý như sự cố (`data-breach.md`).

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
