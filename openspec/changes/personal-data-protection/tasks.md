# Tasks: `personal-data-protection`

Ghi chú: mục 1–11 là **PR code bước 1**. Mục 12 là **PR riêng bước 2**, chỉ làm sau khi bước 1 đã deploy và `pii:backfill --check` = 0.

## 1. Cấu hình và migration bước 1

- [ ] 1.1 `src/lib/env.ts`: thêm `PII_ENCRYPTION_KEYS` (design D2).
  - Production thiếu hoặc sai thì `ConfigError`, thông báo chỉ nêu tên biến.
  - Unit test: thiếu, khóa 16 byte, trùng số khóa, sai dạng, dev không bắt buộc, thông báo không chứa giá trị.
  - Thêm khóa giả vào `.env.example`, `ci.yml`, `update-snapshots.yml`; khóa cho `deploy-demo.yml` theo cách của `BETTER_AUTH_SECRET`.
- [ ] 1.2 Migration chỉ thêm cột vào `supplier` và CHECK (design D5). Bỏ `idNumber`, `bankAccount` khỏi `src/db/schema/catalog.ts`; xóa dòng `DROP` drizzle-kit sinh ra khỏi file SQL.
  - Integration test bằng owner: CHECK định dạng bản mã chặn `001203012345`; CHECK 4 chữ số; `id_number_last4` cần bản mã; CHECK `anonymized_at` chặn dòng còn điện thoại.
- [ ] 1.3 Thêm thao tác `ANONYMIZE` vào `ACTIVITY_ACTIONS`, nhãn D18 "Ẩn danh", CHECK `activity_log_action_check`. Test chống lệch CHECK ↔ TS.
- [ ] 1.4 Quyền `partners.anonymize` chỉ `DIRECTOR` trong `src/domain/permissions.ts`. Unit test bảng quyền.

## 2. Mã hóa và hàm thuần (unit test trước)

- [ ] 2.1 `src/lib/privacy/cipher.ts`, test:
  - mã hóa rồi giải mã ra đúng số;
  - cùng số hai lần ra hai bản mã khác nhau;
  - sai khóa, thiếu số khóa, bản mã bị sửa, sai AAD đều báo `PiiCipherError` đúng `code`;
  - `message` và `JSON.stringify(error)` không chứa số gốc, bản mã, khóa.
- [ ] 2.2 `src/lib/privacy/key-ring.ts` `getPiiKeyRing()`: khóa đầu mã hóa, mọi khóa giải mã; thiếu biến ở dev báo lỗi rõ lúc dùng. Unit test.
- [ ] 2.3 `src/domain/partner-fields.ts`:
  - `isValidBankLast4`, `bankLast4FromLegacy` (bỏ ký tự không phải số, dưới 4 số trả null);
  - `formatBankRef`: `Vietcombank ···5678`, `···5678`, chỉ tên ngân hàng, không có gì ra null.

  Unit test từng trường hợp.
- [ ] 2.4 `src/domain/personal-data.ts`:
  - `PERSONAL_DATA_NOTICES` theo phiên bản, `CURRENT_NOTICE_VERSION`;
  - `ID_NUMBER_RETENTION_YEARS = 10`, `idNumberRetainedUntil(lastReceiptDate, years)`;
  - `sellerLabel`, `anonymizedSellerName`.

  Unit test: 05/03/2026 + 10 năm = 05/03/2036; 29/02/2028 + 10 năm; `PERSON` ra mã, `COMPANY` ra tên; câu chữ phiên bản 1 không đổi (test chụp nguyên văn).

## 3. Service người bán

- [ ] 3.1 `src/lib/catalog/partners.ts`: `toSupplierRow` chỉ đọc cột 4 số cuối, không giải mã; `getSupplierForEdit` giải mã; `createSupplier` sinh `id` trước khi mã hóa. Integration test:
  - sau khi lưu, đọc `supplier::text` bằng owner không chứa `001203012345`, cột bắt đầu `pii1.`;
  - danh sách không gọi hàm giải mã (spy);
  - chép bản mã sang dòng khác thì `GET .../edit` trả 500 chung, không lộ gì.
- [ ] 3.2 `supplierValues` / `updateSupplier`: chỉ giải mã khi thân có `idNumber`; số không đổi thì giữ nguyên bản mã. Integration test: `PATCH` điện thoại không đổi bản mã; đổi CCCD thì đổi cả bản mã và 4 số cuối; gửi `null` xóa cả hai.
- [ ] 3.3 Trường `bankAccountLast4`, câu lỗi "Chỉ nhập 4 số cuối của tài khoản", không lặp lại giá trị. Bỏ `bankAccount` khỏi `src/lib/catalog/respond.ts`. Integration test: `5678` lưu được; số 16 chữ số bị 422 và phản hồi không chứa số đó; khóa `bankAccount` cũ không được lưu.
- [ ] 3.4 Cổng ghi nhận thông báo (design D6). Integration test từng scenario spec: thiếu xác nhận 422 và không lưu; có xác nhận thì lưu phiên bản, `actor.id`, giờ server; người ghi gửi từ client bị bỏ qua; sửa điện thoại không cần xác nhận lại; dữ liệu cũ không tự có ghi nhận; không có CCCD thì không cần.
- [ ] 3.5 Nhật ký của ghi nhận: trường đổi "Ghi nhận thông báo" khi sửa, thêm vào tóm tắt khi tạo. Test dòng nhật ký có phiên bản.
- [ ] 3.6 API: `POST`, `PATCH` nhận trường mới; `GET .../edit` trả `bankAccountLast4`, `idNumber`, ghi nhận, câu chữ, `Cache-Control: no-store`. Integration test: API đọc chung trả số đã che; `.../edit` trả số đầy đủ với Kế toán, 403 với Thủ kho.

## 4. Không ghi tên thật vào bảng chỉ ghi thêm

- [ ] 4.1 `src/domain/activity-changes.ts`: `FieldSpec.personal`, ghi "(đã đổi)", không tính vào `touchesSensitive`. Unit test.
- [ ] 4.2 `src/lib/activity/fields.ts`: áp `personal` cho tên, điện thoại, địa chỉ, mã số thuế, ghi chú của người bán cá nhân (kể cả vừa đổi từ cá nhân sang công ty). Unit test: công ty giữ nguyên giá trị.
- [ ] 4.3 Thay tên bằng `sellerLabel` ở: tóm tắt CREATE, DELETE nhà cung cấp; `orderSummary` và trường `supplier` của đơn mua; `createSummary` của phiếu chi; mô tả dòng sổ `src/lib/receiving/post.ts`. Integration test mỗi chỗ: người bán cá nhân không có tên thật ở bất kỳ cột nào của `activity_log` / `inventory_ledger`; công ty giữ tên.
- [ ] 4.4 Thêm vào `src/lib/activity/coverage.test.ts` (hoặc test tĩnh mới): file ghi nhật ký, ghi sổ không dùng `supplier.name` trực tiếp mà không qua `sellerLabel`.

## 5. Ẩn danh và giữ CCCD

- [ ] 5.1 `lockSupplier` trả `anonymizedAt`; `recordPayment`, `postReceipt`, `updateSupplier`, `getSupplierForEdit` từ chối người đã ẩn danh (409). Integration test từng đường.
- [ ] 5.2 `src/lib/privacy/anonymize.ts` (design D7). Integration test:
  - đúng các trường bị xóa, tên mới, `search_text`, Ngừng dùng;
  - số dòng và tổng giá trị `inventory_ledger`, `goods_receipt`, `activity_log` cũ không đổi;
  - dòng nhật ký `ANONYMIZE` và mọi dòng cũ của người đó không chứa tên, điện thoại, địa chỉ, số CCCD;
  - D14c, đơn mua hiện tên mới;
  - tìm tên cũ ra 0.
- [ ] 5.3 Các điều kiện chặn, mỗi điều kiện một test, đúng câu báo: còn nợ, còn ứng trước, còn đơn đang xử lý, loại công ty, đã ẩn danh, sai mã xác nhận.
- [ ] 5.4 CCCD khi ẩn danh: có phiếu nhập thì giữ bản mã, xóa 4 số cuối; chưa có phiếu nhập thì xóa cả hai. Test tranh chấp: ghi phiếu chi song song với ẩn danh, chỉ một bên thắng.
- [ ] 5.5 API `POST /api/catalog/suppliers/{id}/anonymize`, schema zod, `withAuth` quyền `partners.anonymize`. Test: Giám đốc 200, Kế toán 403. `route-guards.test.ts` xanh.
- [ ] 5.6 `src/lib/privacy/purge.ts` và `npm run pii:purge`. Integration test: ngày 04/03/2036 còn, 05/03/2036 xóa, chạy lại không đổi, một dòng nhật ký với `systemActor`.

## 6. Lệnh vận hành

- [ ] 6.1 `src/lib/privacy/backfill.ts` và `npm run pii:backfill [--check]`. Integration test (chèn cột cũ bằng owner, SQL thô):
  - chuyển đúng; cột cũ trống; chạy lại không đổi;
  - tài khoản `123` bị bỏ, in số dòng, không in số;
  - `--check` thoát 1 khi còn.
- [ ] 6.2 `src/lib/privacy/rotate.ts` và `npm run pii:rotate [--batch] [--check]`. Integration test: 250 dòng hai khóa; dừng giữa chừng rồi chạy lại; chạy lại khi đã xong đổi 0 dòng; `updated_at` không đổi; không in số gốc (bắt stdout).
- [ ] 6.3 `.github/workflows/pii-maintenance.yml`: `workflow_dispatch`, environment `production`, input lệnh `backfill | rotate | rotate-check | purge`.

## 7. Hiển thị tài khoản

- [ ] 7.1 D14c: `src/lib/payables/queries.ts`, `balances.ts`, trang `/payables` dùng `formatBankRef`. Integration test: phản hồi không chứa số CCCD đầy đủ.
- [ ] 7.2 Form ghi phiếu chi hiện "Chuyển vào: <ngân hàng> ···5678". Component test.
- [ ] 7.3 Excel `src/lib/payables/export.ts`: gộp thành một cột "Tài khoản". Integration test: quét mọi ô không có số đầy đủ.

## 8. Giao diện D16

- [ ] 8.1 `FormField` thêm loại `checkbox`; `SUPPLIER_FIELDS` đổi ô tài khoản thành "4 số cuối tài khoản" (`maxLength` 4). Component test.
- [ ] 8.2 Khối thông báo trên form: câu chữ đầy đủ khi có CCCD và chưa ghi nhận; đã ghi nhận thì hiện ngày, người ghi. Component test.
- [ ] 8.3 `partner-details.tsx` dùng `formatBankRef`; người đã ẩn danh không có nút sửa, dùng lại.
- [ ] 8.4 Nút và hộp thoại "Ẩn danh theo yêu cầu" (design D7), chỉ hiện cho `partners.anonymize`, người bán cá nhân, chưa ẩn danh. Component test.
- [ ] 8.5 E2E: sửa `tests/e2e/activity.spec.ts` theo ô mới; thêm test form bắt tích xác nhận khi lưu CCCD (dùng số bắt đầu `000`). Không E2E ẩn danh trên DB dev vì không hoàn tác được; đã có integration test.

## 9. Chống rò

- [ ] 9.1 `src/lib/monitoring/sanitize.ts` (design D10). Unit test: 12 số trong `message` và `stack`; `pii1.` trong chuỗi; trường `idNumberEnc`, `PII_ENCRYPTION_KEYS` bị xóa hẳn; hành vi che cũ giữ nguyên.
- [ ] 9.2 `src/lib/privacy/pii-coverage.test.ts`, kiểm tĩnh:
  - không còn `bank_account` / `id_number` của `supplier` trong `src/`, `scripts/` (trừ `backfill.ts`, `src/db/schema/company.ts` và test của company);
  - hàm giải mã chỉ được gọi từ danh sách cho phép;
  - seed và `sample.ts` không có dãy 12 chữ số không bắt đầu bằng `000`;
  - `search_text` không nhận trường CCCD, tài khoản.
- [ ] 9.3 Rà seed dev, demo: nếu cần CCCD mẫu thì dùng số bắt đầu `000`, kèm ghi nhận thông báo. Test seed xanh.

## 10. Tài liệu

- [ ] 10.1 `docs/ops/data-breach.md` theo design D11.
- [ ] 10.2 `docs/ops/personal-data.md` theo design D11.
- [ ] 10.3 Cập nhật `docs/ops/production.md` (biến mới, đổi khóa, chu kỳ `pii:purge`, khôi phục phải có khóa và chạy lại ẩn danh), `docs/ops/demo.md`, `docs/deploy-production-plan.md` mục 3, 6.
- [ ] 10.4 `CLAUDE.md`: mục quy ước cho `src/lib/privacy/`, cột mới, lệnh `pii:*`, `sellerLabel`. Sửa dòng cũ "CCCD và số tài khoản".

## 11. Kiểm tra trước khi báo xong bước 1

- [ ] 11.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate personal-data-protection --strict` xanh; coverage `src/lib`, `src/domain` ≥ 80 %.
- [ ] 11.2 Gắn nhãn `update-snapshots` vào PR (form nhà cung cấp, D14c đổi), chờ CI xanh.
- [ ] 11.3 Kiểm tra tay trên staging: làm sau, theo dõi ở #33. Thêm mục vào #33 với các bước:
  - xem bảng `supplier` bằng `psql`: CCCD là chuỗi `pii1.`, không có số tài khoản đầy đủ;
  - form sửa (`partners.manage`) hiện đúng CCCD;
  - bản `pg_dump` không chứa số gốc;
  - đổi khóa theo runbook chạy được.

## 12. Bước 2: bỏ cột cũ (PR riêng, deploy sau)

- [ ] 12.1 Điều kiện: bước 1 đã deploy; `pii:backfill --check` = 0 ở mọi môi trường có dữ liệu.
- [ ] 12.2 Migration viết tay: dừng nếu `id_number` hoặc `bank_account` còn dữ liệu, rồi `DROP COLUMN` và CHECK `supplier_id_number_check`. Integration test bằng owner: còn dữ liệu thì dừng; cột đã mất.
- [ ] 12.3 Xóa `src/lib/privacy/backfill.ts`, lệnh `pii:backfill`, test của nó, lựa chọn `backfill` trong workflow. Thu hẹp danh sách cho phép của kiểm tĩnh.
- [ ] 12.4 `npm run lint && npm run typecheck && npm test` xanh; deploy; `/api/health` = 200.

## Workflow follow-up

- Đóng #99 sau khi archive.
- Hồ sơ đánh giá tác động và chuyển dữ liệu ra nước ngoài theo dõi ở #78.
