# Proposal: Bảo vệ dữ liệu cá nhân của người bán (`personal-data-protection`)

## Why

Số CCCD và số tài khoản người bán đang **lưu chữ thường trong DB**. Lộ một bản sao lưu hoặc `DATABASE_URL` là lộ hết. Nghị định 356/2025/NĐ-CP xếp thông tin tài khoản ngân hàng vào dữ liệu nhạy cảm. Doanh nghiệp xử lý dữ liệu nhạy cảm mất quyền miễn thủ tục của doanh nghiệp nhỏ.

Chủ đã chốt cách làm (0.2 #156–#159, 10/11/2026). Change này phải xong **trước #48 `data-migration`**, vì sau đó dữ liệu thật mới vào hệ thống.

## What Changes

**[MVP]**, màn **D16** (đối tác), **D14c** (phải trả), **D18** (nhật ký), **D10** (thẻ kho: mô tả dòng nhập).

- **Mã hóa CCCD:** lưu bản mã AES-256-GCM trong cột mới, mã hóa ở app. Cột 4 số cuối riêng, nên danh sách không cần giải mã. Chỉ form sửa (`partners.manage`) giải mã.
- **Khóa:** biến môi trường `PII_ENCRYPTION_KEYS` (mỗi công ty một khóa, vì mỗi công ty một DB và một bản deploy). Production thiếu khóa thì từ chối khởi động.
- **Đổi khóa:** lệnh `npm run pii:rotate` mã hóa lại theo lô, chạy lại được, đọc được khóa cũ trong lúc chuyển.
- **BREAKING: số tài khoản chỉ lưu 4 số cuối** (0.2 #157).
  - Form chỉ nhận đúng 4 chữ số.
  - API đổi trường `bankAccount` thành `bankAccountLast4`.
  - D16, D14c, form ghi phiếu chi, Excel hiện `<ngân hàng> ···1234`.
  - Excel phải trả gộp hai cột STK và Ngân hàng thành một cột "Tài khoản".
- **Migration hai bước** (theo `docs/deploy-production-plan.md` mục 7):
  - Bước 1: thêm cột mới, deploy code mới, chạy `npm run pii:backfill` để chuyển dữ liệu và xóa trắng cột cũ.
  - Bước 2 (PR riêng, deploy sau): bỏ cột `id_number`, `bank_account`.
- **Ghi nhận đã thông báo** (0.2 #163): câu thông báo nêu đủ mọi dữ liệu cá nhân phần mềm lưu. Người bán cá nhân lưu lần đầu điện thoại, địa chỉ, CCCD hoặc tài khoản thì phải có ghi nhận (phiên bản câu chữ, người ghi, lúc ghi). Chỉ có tên thì không cần. Mọi dòng có CCCD đều cần, kể cả loại công ty.
- **Ẩn danh người bán cá nhân khi được yêu cầu** (nút mới trên D16, chỉ Giám đốc):
  - giữ mã NCC và mọi chứng từ;
  - xóa tên thật, điện thoại, địa chỉ, mã số thuế, CCCD, 4 số cuối, ngân hàng, ghi chú khỏi các trường hiện;
  - người đã nhập hàng: giữ **tên + địa chỉ + CCCD** thành một gói mã hóa "hồ sơ thuế" (0.2 #161), không màn nào giải mã được, hết hạn thì `npm run pii:purge` xóa. Chưa nhập hàng lần nào thì xóa hết, không tạo gói;
  - chặn khi còn nợ, còn tiền ứng trước hoặc còn đơn đang xử lý.
- **Thời hạn giữ CCCD áp cho mọi người bán** (0.2 #166): quá thời hạn (mặc định 10 năm, chờ luật sư) kể từ lần nhập gần nhất, chưa từng nhập thì từ ngày tạo, `npm run pii:purge` xóa CCCD, ghi nhật ký.
- **Không ghi tên thật người bán cá nhân vào bảng chỉ ghi thêm:** sổ kho và nhật ký ghi **mã NCC** thay tên; trường tên, điện thoại, địa chỉ, ghi chú trong nhật ký chỉ ghi "(đã đổi)". Nếu không, ẩn danh sẽ không xóa được tên ở hai bảng này. Người bán công ty giữ nguyên.
- **Báo lỗi (K11):** quét cả nội dung chuỗi, che dãy 12 chữ số và bản mã, không chỉ theo tên trường.
- **Runbook:** `docs/ops/data-breach.md` (sự cố lộ dữ liệu) và `docs/ops/personal-data.md` (khóa, đổi khóa, ẩn danh, khôi phục bản sao lưu).

### Ngoài phạm vi

- Hồ sơ đánh giá tác động và hồ sơ chuyển dữ liệu ra nước ngoài: tài liệu riêng, luật sư duyệt (0.2 #159, #78).
- Ảnh CCCD: không lưu (0.2 #158).
- Số tài khoản của **công ty mình** (`company_profile.bank_account`): là thông tin in trên hợp đồng, không phải dữ liệu cá nhân, giữ nguyên.
- **Nhà thầu cá nhân** (`customer`: tên, người liên hệ, điện thoại, địa chỉ) (0.2 #167): change này chỉ làm người bán vì đó là chỗ có dữ liệu nhạy cảm (CCCD, tài khoản); nhà thầu không có hai trường này. Quyền xem, sửa, xóa theo luật vẫn áp cho họ: yêu cầu xóa xử lý tay theo `docs/ops/personal-data.md`.
- Thông tin nhân viên: không có CCCD hay số tài khoản trong DB.
- Mẫu in bảng kê thu mua không hóa đơn: chưa có màn này. Bảng kê của người đã ẩn danh cần đọc gói hồ sơ thuế, việc đó phải có change riêng.
- Tìm hoặc kiểm trùng theo CCCD: không làm (design D3).
- Ghi chú tự do trên chứng từ (đơn mua, phiếu chi): phần mềm không quét được, runbook có bước rà tay.

## Ảnh hưởng tới số liệu

Không đổi số lượng, giá vốn, tiền thuê, công nợ. Đổi duy nhất ở sổ kho: **chữ mô tả** của dòng nhập mới từ người bán cá nhân ghi mã NCC thay tên. Dòng sổ cũ không bị sửa. Ẩn danh không ghi dòng sổ nào.

## Capabilities

### New Capabilities

- `personal-data-protection`: mã hóa và khóa CCCD, đổi khóa, chuyển dữ liệu cũ, ghi nhận thông báo, ẩn danh người bán, không để lộ qua log và seed, runbook.

### Modified Capabilities

- `partner-directory`: trường số tài khoản thành 4 số cuối; CCCD lưu mã hóa; form có ghi nhận thông báo.
- `payables`: cách hiện tài khoản trên D14c, form ghi phiếu chi và Excel.
- `activity-log`: nhật ký không chứa số đầy đủ, người bán cá nhân ghi bằng mã.
- `error-monitoring`: che theo nội dung chuỗi, không chỉ theo tên trường.

## Impact

- **DB:** thêm cột vào `supplier` (bước 1), bỏ `id_number`, `bank_account` (bước 2). Không có bảng mới.
- **API:** `POST /api/catalog/suppliers/{id}/anonymize` (mới); thân `POST`/`PATCH` nhà cung cấp đổi trường; `GET .../edit` trả `bankAccountLast4`, thông tin ghi nhận.
- **Quyền:** thêm `partners.anonymize` (chỉ Giám đốc).
- **Code:** `src/lib/privacy/` (mới), `src/domain/personal-data.ts` (mới), `src/lib/catalog/partners.ts`, `src/lib/payables/`, `src/lib/receiving/post.ts`, `src/lib/purchasing/activity.ts`, `src/lib/activity/fields.ts`, `src/lib/monitoring/sanitize.ts`, `src/lib/env.ts`, `src/components/catalog/`.
- **Vận hành:** biến `PII_ENCRYPTION_KEYS` trên Vercel và GitHub Secrets (CI, demo, production); workflow chạy tay `pii-maintenance.yml`; `.env.example`; `docs/ops/`.
- **Thư viện:** không thêm (dùng `node:crypto`).
- **Ảnh mốc:** form nhà cung cấp, D14c đổi nên phải chụp lại.
