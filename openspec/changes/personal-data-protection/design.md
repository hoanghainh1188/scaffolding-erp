# Design: Bảo vệ dữ liệu cá nhân của người bán

## Context

Hiện trạng đọc từ code:

- `supplier.id_number`, `supplier.bank_account` là `text` chữ thường. CHECK của `id_number` là 12 chữ số.
- Số đã che tính lúc đọc. `listSuppliers`, `readSupplierInfos` đọc số đầy đủ cho mọi vai trò rồi mới che, dù API không trả ra.
- `search_text` không chứa CCCD, số tài khoản (đúng). Có chứa tên và điện thoại.
- `diffFields` che CCCD và số tài khoản, nhưng tên, điện thoại, địa chỉ vào nhật ký nguyên văn.
- **Tên người bán đang được ghi vào bảng chỉ ghi thêm:**
  - `src/lib/receiving/post.ts`: mô tả dòng sổ `Nhập từ PO · <tên> · chuyến N`;
  - `orderSummary` và trường `supplier` của đơn mua (`src/lib/purchasing/activity.ts`);
  - `createSummary` của phiếu chi (`src/lib/payables/payments.ts`);
  - tóm tắt CREATE, DELETE nhà cung cấp (`src/lib/catalog/partners.ts`).
- Không có bảng nào chép tên người bán. Mọi màn đọc `supplier.name` trực tiếp, nên đổi tên một chỗ là mọi màn đổi theo.
- `sanitizeErrorPayload` chỉ che theo **tên trường**. CCCD nằm trong chuỗi lỗi thì lọt.
- Seed không có CCCD, số tài khoản người bán.
- Backup: `pg_dump` hằng đêm, mã hóa AES-256-CBC, giữ 30 ngày.
- Production chưa có dữ liệu cá nhân thật (0.2 #159), nên dữ liệu cũ chỉ là dev, demo (0.2 #157).

Ràng buộc: sổ kho và nhật ký chỉ ghi thêm; migration DB thật theo hai bước; mỗi công ty một DB (0.2 #33).

## Goals / Non-Goals

**Goals:**

- Lộ DB hoặc bản sao lưu không lộ CCCD và số tài khoản đầy đủ.
- Đường đọc số gốc càng ít càng tốt, có kiểm tra tĩnh giữ.
- Ẩn danh xóa được thật, không phải chỉ che khi hiện.

**Non-Goals:**

- Mã hóa tên, điện thoại, địa chỉ (cần tìm kiếm, và không xếp vào nhóm nhạy cảm).
- KMS ngoài, mã hóa toàn bộ dòng.
- Các mục "Ngoài phạm vi" trong proposal.

## Decisions

### D1. Mã hóa ở app bằng AES-256-GCM (điểm 1 của issue)

Dùng `node:crypto`, trong `src/lib/privacy/cipher.ts`. Hàm thuần, nhận khóa làm tham số.

Định dạng bản mã, một chuỗi `text`:

```text
pii1.<số khóa>.<IV 12 byte base64url>.<bản mã + tag base64url>
```

- IV ngẫu nhiên 12 byte mỗi lần.
- Dữ liệu xác thực kèm (AAD) = `supplier:<id>:id_number`. Bản mã chép sang dòng khác sẽ không giải mã được. Vì vậy `createSupplier` sinh `id` ở app trước khi mã hóa.
- CHECK DB bắt định dạng `^pii1\.[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`, nên không ghi nhầm số gốc vào cột này được.

| Phương án | Kết luận |
|---|---|
| **App, AES-256-GCM** | **Chọn.** Khóa không rời server app; DB chỉ thấy bản mã; có xác thực toàn vẹn; không thêm thư viện |
| `pgcrypto` | Loại. Khóa phải gửi trong câu SQL, có thể lộ qua `pg_stat_statements`, log Neon, thông báo lỗi. DB và khóa cùng một nơi mất ý nghĩa |
| KMS của cloud | Loại lúc này. Thêm dịch vụ và độ trễ, công ty 5 vai trò không cần. Nếu cần sau, chỉ đổi nơi lấy khóa |
| AES-CBC | Loại. Không phát hiện được bản mã bị sửa |

### D2. Khóa (điểm 1)

- Biến `PII_ENCRYPTION_KEYS`, dạng `2:<base64>,1:<base64>`. Khóa đầu mã hóa, mọi khóa giải mã. Cùng cú pháp với `BETTER_AUTH_SECRETS` nên người vận hành chỉ học một lần.
- Sinh khóa: `openssl rand -base64 32`. `parseEnv` kiểm mỗi khóa đúng 32 byte, số khóa không trùng.
- **Mỗi công ty một khóa:** mỗi công ty một DB, một bản deploy, nên mỗi bản có biến riêng. Một hàm duy nhất `getPiiKeyRing()` lấy khóa; lên SaaS chỉ sửa hàm này (giữ đường lui 0.2 #33).
- **Production thiếu hoặc sai thì từ chối khởi động:** thêm vào `parseEnv` (đã chạy trong `src/instrumentation.ts`). Thông báo theo `RULES`, chỉ nêu tên biến và luật.
- Dev, test không bắt buộc, báo lỗi rõ lúc dùng. `.env.example` và CI có khóa giả.
- **Không bao giờ log khóa hay số gốc:** lớp lỗi `PiiCipherError` chỉ có `code` và số khóa; không gói lỗi gốc. `sanitize` chặn thêm ở D10.

### D3. Không thêm cột băm HMAC (điểm 2)

Không làm, vì hiện không có nhu cầu:

- CCCD đã cố ý không tìm được (comment trong `partners.ts`, spec D16).
- Không có luật "một CCCD một người bán". Cùng một người có thể có hai mã NCC.
- Thêm cột băm là thêm một thứ gắn được với người thật, thêm một khóa phải giữ.

Khi cần kiểm trùng (ví dụ lúc nhập Excel ở #48): thêm cột `id_number_hmac` dùng HMAC-SHA-256 với khóa riêng `PII_HMAC_KEY`, sinh ngược từ bản mã bằng một lệnh theo lô. Thêm sau không mất gì. Băm trần không dùng được: CCCD có cấu trúc, số khả năng ít, dò ra hết.

### D4. Đổi khóa (điểm 3)

`npm run pii:rotate -- [--batch 100] [--check]`, code ở `src/lib/privacy/rotate.ts`.

- Mỗi lô một transaction: chọn dòng có bản mã **không** bắt đầu bằng `pii1.<khóa đầu>.`, `ORDER BY id LIMIT n FOR UPDATE SKIP LOCKED`, giải mã, mã hóa lại, ghi. Không đổi `updated_at`.
- Chạy lại được: dòng đã xong tự ra khỏi điều kiện lọc.
- Trong lúc chuyển: ứng dụng đọc được cả hai khóa vì bản mã mang số khóa.
- `--check` chỉ đếm, còn sót thì thoát mã 1.
- Không ghi nhật ký từng dòng: giá trị không đổi. In số lượng ra màn hình.
- Trình tự (`docs/ops/personal-data.md`): thêm khóa mới đứng đầu → deploy → `pii:rotate` → `--check` = 0 → bỏ khóa cũ khỏi biến → **giữ khóa cũ ở nơi an toàn tối thiểu 30 ngày** để giải mã bản sao lưu cũ.

Chạy bằng workflow chạy tay `pii-maintenance.yml` (`workflow_dispatch`, environment `production`, duyệt như deploy), lệnh chọn `backfill | rotate | rotate-check | purge`. Không tải khóa production về máy cá nhân.

### D5. Số tài khoản và migration hai bước (điểm 4)

Cột thêm vào `supplier` ở **bước 1** (mọi cột cho phép trống):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id_number_enc` | `text` | Bản mã, CHECK định dạng D1 |
| `id_number_last4` | `text` | CHECK 4 chữ số |
| `bank_account_last4` | `text` | CHECK 4 chữ số |
| `id_notice_version` | `integer` | Phiên bản câu chữ (D6) |
| `id_notice_at` | `timestamptz` | |
| `id_notice_by` | `text` FK `user` `RESTRICT` | |
| `anonymized_at` | `timestamptz` | D7 |
| `anonymized_by` | `text` FK `user` `RESTRICT` | |
| `anonymize_requested_on` | `date` | Ngày nhận yêu cầu, để chứng minh hạn 20 ngày |

CHECK thêm:

- `id_number_last4 is null or id_number_enc is not null`. Ngược lại được: đang giữ theo hạn thuế thì có bản mã, không có 4 số cuối.
- `anonymized_at is null or (phone, address, tax_code, note, bank_name, bank_account_last4, id_number_last4 đều null và status = 'ARCHIVED')`.

Vì sao có cột 4 số cuối CCCD riêng: danh sách, D14c, Excel không phải giải mã. Khóa chỉ dùng ở form sửa; khóa hỏng thì danh sách vẫn chạy. 4 số cuối CCCD là phần ngẫu nhiên, đã hiện cho mọi vai trò từ trước.

Các bước:

1. **Bước 1 (PR code):**
   - Migration chỉ thêm. Bỏ `idNumber`, `bankAccount` khỏi `src/db/schema/catalog.ts` và **xóa các dòng `DROP` drizzle-kit sinh ra** khỏi file SQL. Cột cũ còn trong DB nhưng code không đọc được nữa, kể cả `.select()`.
   - Deploy. Kiểm tra. Rồi chạy `npm run pii:backfill` (chỉ file này đọc cột cũ, bằng SQL thô): mỗi dòng một transaction, mã hóa CCCD, lấy 4 số cuối tài khoản (bỏ ký tự không phải số), **xóa trắng hai cột cũ**. Chạy lại được; `--check` đếm số dòng còn cột cũ.
2. **Bước 2 (PR riêng, sau khi bước 1 đã deploy và `--check` = 0 ở mọi môi trường):** migration viết tay (`drizzle-kit generate --custom`) dừng nếu cột cũ còn dữ liệu rồi `DROP COLUMN`. Xóa lệnh backfill và test của nó.

Quay lui giữa hai bước: bản cũ vẫn chạy vì cột cũ còn và cho phép trống. Sau backfill, bản cũ hiện CCCD trống cho tới khi deploy lại bản mới. Vì vậy backfill chạy **sau** khi đã kiểm tra bản mới.

Form và API:

- Trường `bankAccountLast4`, kiểm `^[0-9]{4}$`. Sai thì 422 với câu cố định, không lặp lại giá trị đã nhập.
- Không cắt tự động khi dán cả số: cắt ngầm khiến người dùng tưởng đã lưu đủ.
- Trường `bankAccount` cũ trong thân yêu cầu bị zod bỏ qua, không lưu.
- Hàm `formatBankRef(bankName, last4)` ở `src/domain/partner-fields.ts` cho D16, D14c, form phiếu chi, Excel. Không tự ghép chuỗi ở từng màn.

Số tài khoản của công ty (`company_profile.bank_account`) không đổi; kiểm tra tĩnh loại trừ riêng bảng đó.

### D6. Ghi nhận thông báo (điểm 5)

Luật cho xử lý không cần đồng ý khi để thực hiện nghĩa vụ pháp lý, nhưng vẫn phải chứng minh được thời điểm và nội dung (tra cứu ở #78, chờ luật sư). Nên ghi nhận "đã thông báo", không dựng quy trình ký đồng ý.

- Thân yêu cầu thêm `idNoticeConfirmed: boolean`. Server tự ghi phiên bản hiện hành, `actor.id`, giờ server.
- Cổng kiểm trong `supplierValues`: có gửi CCCD khác null, dòng chưa có ghi nhận, `idNoticeConfirmed` không phải `true` thì 422.
- Áp cho mọi dòng có CCCD, không chỉ loại cá nhân: CCCD luôn là của một người.
- Không tự tạo ghi nhận cho dữ liệu cũ (không dựng chứng cứ giả).
- Bằng chứng gồm: ba cột trên `supplier` để kiểm cổng, và dòng nhật ký chỉ ghi thêm (người, giờ, thiết bị). Không tạo bảng riêng.

Câu chữ đặt ở `src/domain/personal-data.ts`, theo phiên bản, đã dùng thì không sửa. Tên và điện thoại công ty lấy từ Cài đặt (không viết cứng, 0.2 #33). **Đề xuất phiên bản 1:**

> {Tên công ty} lưu số CCCD của ông/bà để lập bảng kê thu mua hàng hóa không có hóa đơn khi quyết toán thuế. Số CCCD được mã hóa và chỉ nhân viên được giao việc mới xem được. Dữ liệu lưu trên máy chủ đặt tại Singapore, trong 10 năm kể từ lần mua gần nhất. Ông/bà có quyền yêu cầu xem, sửa hoặc xóa, liên hệ {điện thoại công ty}.

Form hiện câu này cạnh ô CCCD với ô xác nhận "Đã thông báo cho người bán". Đã có ghi nhận thì hiện "Đã thông báo ngày dd/mm/yyyy, <người ghi>". `FormField` thêm loại `checkbox`.

### D7. Ẩn danh (điểm 6)

Service `anonymizeSupplier` ở `src/lib/privacy/anonymize.ts`. Một transaction:

1. `lockSupplier` (`FOR UPDATE`). Chỉ lấy một khóa này nên không xung đột thứ tự khóa của `postReceipt` (đơn → bãi → sổ kho → NCC cuối).
2. Kiểm: loại `PERSON`; chưa ẩn danh; `confirmCode` đúng mã; `owed = 0`; `advance = 0` (qua `readLedger`); không có đơn đang xử lý (`openOrderCodesForSupplier`).
3. `UPDATE` một dòng: tên `Đã ẩn danh (<mã>)` (`ANONYMIZED_SELLER_NAME`), xóa các trường, `search_text`, `status = 'ARCHIVED'`.
4. CCCD: có phiếu nhập (`goods_receipt` nối đơn của người bán) thì giữ `id_number_enc`, xóa `id_number_last4`; chưa có thì xóa cả hai.
5. `logActivity` thao tác mới `ANONYMIZE`, tóm tắt cố định "Ẩn danh theo yêu cầu nhận ngày dd/mm/yyyy", cờ nhạy cảm.

Không có ô lý do tự do: chữ gõ vào nhật ký chỉ ghi thêm thì không xóa được.

Chặn dùng sau đó: `updateSupplier`, `getSupplierForEdit` (409); `lockSupplier` trả thêm `anonymizedAt`, `recordPayment` và `postReceipt` từ chối. `lockSupplier` nằm trong đường ghi của cả hai nên hết tranh chấp với ẩn danh.

Quyền: `partners.anonymize` chỉ `DIRECTOR`. Không hoàn tác được nên một người chịu trách nhiệm.

API: `POST /api/catalog/suppliers/{id}/anonymize`, thân `{ confirmCode, requestedOn }`, bọc `withAuth`.

Giao diện D16: nút "Ẩn danh theo yêu cầu" (chỉ người bán cá nhân, chưa ẩn danh, có quyền), hộp thoại nêu hậu quả, ô nhập mã NCC, `DateInput` ngày nhận yêu cầu.

**Thời hạn giữ CCCD:** `ID_NUMBER_RETENTION_YEARS = 10` ở `src/domain/personal-data.ts`. Hạn = ngày nhập gần nhất + số năm, **tính ra**, không lưu, nên đổi tham số không phải sửa dữ liệu. `npm run pii:purge` xóa bản mã hết hạn, ghi nhật ký với `systemActor`. Chạy hằng năm, thêm vào bảng chu kỳ của `docs/ops/production.md`.

| Phương án cho CCCD khi ẩn danh | Kết luận |
|---|---|
| **Giữ bản mã tới hết hạn, khóa mọi đường đọc** | **Chọn.** Vừa trả lời được yêu cầu xóa, vừa còn số cho cơ quan thuế |
| Xóa ngay | Loại. Có thể vi phạm nghĩa vụ giữ chứng từ |
| Chặn ẩn danh tới hết 10 năm | Loại. Không làm được trong hạn 20 ngày |

### D8. Tên người bán cá nhân trong bảng chỉ ghi thêm (điểm 6, 7)

Sổ kho và nhật ký không `UPDATE` được, nên chỉ có một cách để ẩn danh xóa thật: **không ghi tên vào đó từ đầu**.

- Hàm `sellerLabel({ kind, code, name })` ở `src/domain/personal-data.ts`: `PERSON` trả mã, `COMPANY` trả tên. Dùng ở 4 chỗ liệt kê ở Context.
- `FieldSpec` thêm `personal?: (record) => boolean`. Khi đúng, `diffFields` chỉ ghi "(đã đổi)" và `touchesSensitive` không tính. Áp cho tên, điện thoại, địa chỉ, mã số thuế, ghi chú của người bán đang hoặc vừa là cá nhân.

Được vì production chưa có dữ liệu thật (0.2 #159): từ lúc có dữ liệu thật, hai bảng này chưa bao giờ chứa tên.

| Phương án | Kết luận |
|---|---|
| **Ghi mã từ đầu** | **Chọn.** Dữ liệu thật sự không có trong bảng. Đổi lại: thẻ kho, nhật ký của người bán cá nhân khó đọc hơn, phải tra mã |
| Che khi hiện (lúc đọc thay tên nếu đã ẩn danh) | Loại. Tên vẫn nằm trong DB và bản sao lưu |
| Cho phép `UPDATE` nhật ký bằng hàm riêng | Loại. Phá nguyên tắc chỉ ghi thêm |

### D9. Danh sách chỗ có thể rò và test tương ứng (điểm 7)

| Chỗ | Biện pháp | Test |
|---|---|---|
| `search_text` | Không có CCCD, số tài khoản; ẩn danh thì chỉ còn tên mới và mã | Integration: đọc cột, tìm tên cũ ra 0 |
| Nhật ký | D8; `diffFields` nhận số đã giải mã, chỉ ghi dạng che | Integration: quét mọi cột của `activity_log` |
| Excel phải trả | Chỉ đọc cột 4 số cuối | Integration: quét toàn bộ ô |
| Bản sao lưu | Backfill xóa trắng cột cũ; bản cũ hết hạn sau 30 ngày; xóa nhánh Neon `pre-deploy-*` có trước backfill | Integration: `supplier::text` không chứa số gốc; kiểm tra tay `pg_dump` (#33) |
| Seed | Số giả bắt đầu `000` | Kiểm tĩnh quét seed và `sample.ts` |
| Sentry, log | D10 | Unit trên `sanitize` |
| Đọc nhầm số gốc | Không còn cột trong schema; hàm giải mã có danh sách được gọi | Kiểm tĩnh `src/lib/privacy/pii-coverage.test.ts` |

### D10. Báo lỗi

Thêm vào `sanitizeErrorPayload`:

- Quét mọi chuỗi: `\b\d{12}\b` thành `[CCCD]`, `pii1\.[\w.-]+` thành `[REDACTED]`.
- Tên trường: `idNumberEnc`, `id_number_enc`, `PII_ENCRYPTION_KEYS` vào nhóm xóa hẳn.

Giữ cách che cũ theo tên trường (spec hiện có). Dãy 12 số không phải CCCD cũng bị che: chấp nhận, vì chỉ làm báo lỗi khó đọc hơn một chút.

### D11. Runbook (điểm 8)

- `docs/ops/data-breach.md`: nhận biết, khoanh vùng, đổi khóa và secret, báo người bị ảnh hưởng trong 72 giờ (ghi rõ cách tính mốc), báo cơ quan quản lý (A05, Bộ Công an; chờ luật sư xác nhận), mẫu hồ sơ sự cố, lưu ≥ 5 năm, người chịu trách nhiệm từng bước. Ghi rõ đây là bản tra cứu, chưa phải ý kiến luật sư.
- `docs/ops/personal-data.md`: cất khóa trong kho mật khẩu **tách khỏi** nơi cất bản sao lưu (mất khóa là mất hết CCCD); đổi khóa; backfill; yêu cầu xóa (trả lời 2 ngày làm việc, xong trong 20 ngày); sổ yêu cầu xóa ngoài DB; chạy lại ẩn danh sau khi khôi phục.

### D12. Đối chiếu vào code

- Module `src/lib/privacy/`: `cipher.ts` (thuần), `key-ring.ts`, `anonymize.ts`, `backfill.ts`, `rotate.ts`, `purge.ts`.
- `src/domain/personal-data.ts`: câu chữ, phiên bản, thời hạn, `sellerLabel`, tên ẩn danh.
- `src/lib/catalog/partners.ts`: `getSupplierForEdit` giải mã; `toSupplierRow` không giải mã; `updateSupplier` chỉ giải mã khi thân yêu cầu có `idNumber`, và chỉ mã hóa lại khi số thật sự đổi.
- API danh sách đổi trường: bỏ `bankAccountMasked`, thêm `bankAccountLast4`, `anonymized`.
- Không thêm thư viện.

## Risks / Trade-offs

- **Mất khóa là mất hết CCCD** → runbook bắt buộc cất khóa ở kho mật khẩu, kiểm tra được giải mã trên staging trước khi coi là xong.
- **Khóa và DB cùng lộ** (ví dụ lộ cả biến Vercel) thì mã hóa không cứu được → giảm rủi ro bằng role tối thiểu, khóa chỉ trên server app, đổi khóa khi nghi lộ.
- **Bản sao lưu cũ còn số gốc tối đa 30 ngày sau backfill**, cộng lịch sử Neon → chấp nhận vì chỉ có dữ liệu dev, demo; runbook nhắc xóa nhánh `pre-deploy-*` và xác nhận bản sao lưu cũ đã hết hạn trước khi đưa dữ liệu thật lên.
- **Ghi chú tự do trên chứng từ** có thể chứa tên người bán, phần mềm không quét được → runbook có bước rà tay; `supplier.note` bị xóa khi ẩn danh.
- **Bản sao lưu có người đã ẩn danh** → sổ yêu cầu xóa ngoài DB, chạy lại sau khôi phục.
- **Thẻ kho, nhật ký khó đọc hơn với người bán cá nhân** → đổi lấy việc xóa được thật (D8).
- **Ý kiến luật sư có thể đổi** thời hạn, câu chữ, thông báo hay đồng ý → thời hạn là tham số, câu chữ theo phiên bản.

## Migration Plan

Bước 1: `db:migrate` (chỉ thêm) → thêm biến `PII_ENCRYPTION_KEYS` trên Vercel và GitHub Secrets **trước** khi deploy (thiếu là không khởi động) → deploy → kiểm tra → `pii:backfill` → `pii:backfill --check` = 0.

Bước 2: PR riêng, migration bỏ cột có chặn dữ liệu còn sót. Bản cũ của bước 1 không đọc cột cũ nên quay lui an toàn.

## Open Questions

Đều đã có đề xuất mặc định trong tài liệu này. Câu hỏi nêu trong mô tả PR; người dùng trả lời thì ghi vào `docs/requirements.md` 0.2 và sửa change:

1. Quyền ẩn danh chỉ Giám đốc (D7).
2. Giữ bản mã CCCD 10 năm, xóa tên ngay (D7). Luật sư có thể yêu cầu giữ cả tên.
3. Ghi mã NCC thay tên người bán cá nhân ở sổ kho và nhật ký (D8).
4. Câu chữ thông báo phiên bản 1, chỉ thông báo chứ không ký đồng ý (D6).
5. Không thêm HMAC (D3).
6. Điều kiện chặn ẩn danh gồm cả tiền ứng trước và đơn đang xử lý (D7).
