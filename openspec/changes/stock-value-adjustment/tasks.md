# Tasks: stock-value-adjustment

## 1. Tài liệu và cơ sở dữ liệu

- [x] 1.1 Ghi `docs/requirements.md` 0.2 #35 (điều chỉnh giá trị: dòng `REVALUE` số lượng 0 không vị trí, tồn 0 thì chặn, còn tồn thì dồn cả chênh lệch, hàng ở công trình chịu chênh lệch, chứng từ gốc bắt buộc, chia lại chỉ cho chi phí chuyến phiếu nhập; chốt 29/10/2026). Đã ghi trong PR propose #65 theo review.
- [x] 1.2 Viết `drizzle/0009_stock_value_adjustment.sql` và sửa schema Drizzle (`src/db/schema/inventory.ts`) theo design D6: `inventory_ledger` cho `location_id` trống chỉ với `REVALUE` (số lượng 0); `stock_adjustment` loại `REVALUE`, `source_receipt_id`, `recorded_trip_cost`, `corrected_trip_cost`, check, unique một phần; `stock_adjustment_line` kiểu `VALUE`, `value_delta`, check shape, unique. Kiểm: `npm run db:migrate` chạy trên DB dev, `npm run inventory:check` vẫn "0 lệch".
- [x] 1.3 Integration test schema (`src/db/schema/inventory.int.test.ts`): DB nhận `REVALUE` số lượng 0 không vị trí; từ chối `REVALUE` có số lượng, `REVALUE` có vị trí, `ADJUST_IN` không vị trí, dòng `VALUE` có `value_delta` 0; trigger vẫn chặn UPDATE/DELETE dòng `REVALUE`; hai phiếu sửa chi phí chưa `DONE` cùng phiếu nhập bị unique chặn. Kiểm: `npm run test:int` xanh.
- [x] 1.4 Cập nhật `CLAUDE.md` mục Quy ước code, gạch "Sổ kho": `inventory_ledger.location_id` có thể `NULL` (chỉ dòng `REVALUE`, số lượng 0); truy vấn theo vị trí phải `inner join location` hoặc lọc `location_id is not null`; thẻ kho lọc vị trí thêm `OR location_id IS NULL`; `REVALUE` là loại thứ tư đổi giá BQ (cùng `OPENING`, `PURCHASE_IN`, `REPAIR_IN`). Thêm gạch "Phiếu điều chỉnh giá trị" (`ĐCG`, chứng từ gốc bắt buộc, sửa chi phí chuyến qua `buildTripRevaluation`). Kiểm: đọc lại mục, `npm run format:check` xanh.

## 2. Logic thuần + unit test (viết test trước)

- [x] 2.1 `src/domain/movement.ts`: thêm `REVALUE`, `changesAverage` gồm `REVALUE`, `assertMovementLine` cho số lượng 0 chỉ với `REVALUE` ("Dòng điều chỉnh giá không có số lượng" khi khác 0). Kiểm: `movement.test.ts` có ca 0 cái `ADJUST_IN` vẫn bị từ chối, `REVALUE` 5 cái bị từ chối, `REVALUE` 0 nhận.
- [x] 2.2 `src/domain/stock-revaluation.ts` `averageAfterRevalue`: **giá BQ mới = (giá trị hiện tại ± chênh lệch) ÷ tồn hiện tại, làm tròn 1 ₫** bằng bigint. Kiểm: unit test đủ số của spec: 1.240 × 195.282 − 1.500.000 → 194.072; 1.220 × 195.000 + 610.000 → 195.500; 2 × 100 + 1 → 101; 2 × 100 − 1 → 100; 12.850,5 kg × 7.952 + 500.000 → 7.991; tồn 0 → "đã hết hàng"; 42 × 160.000 − 7.000.000 → "bị âm (−280.000 ₫)"; về đúng 0 → 0; số lớn (9.000.000 cái × 1.000.000.000 ₫ ± 1) không tràn.
- [x] 2.3 `assertValueLine` và `revaluationMovements` trong cùng file: chênh lệch 0, số lẻ, trùng (mã + tình trạng) bị từ chối đúng câu chữ; mỗi dòng ra đúng một `MovementDraft` `REVALUE` số lượng 0, vị trí `null`, diễn giải "Giảm/Tăng giá trị x ₫ · sửa <chứng từ gốc>". Kiểm: unit test.
- [x] 2.4 `revaluationFromTrip` (thuần, dùng `receipt-cost.ts`): dựng dòng chênh lệch từ (dữ liệu chuyến, chi phí hiện hành, chi phí đúng, đã ghi theo mã + tình trạng). Kiểm: unit test ví dụ `PN-2026-094` (35.000.000 → 3.500.000 ra −23.403.614 / −8.096.386, tổng −31.500.000); lô cũ có phế liệu giữ 1.215.000 ₫; sửa lần hai chỉ ra phần chênh giữa 3.800.000 và 3.500.000; chi phí không đổi → lỗi; dựng lại chi phí hiện hành không ra đúng "đã ghi" → "Không dựng lại được cách chia của PN-…, lập dòng tay".
- [x] 2.5 `src/domain/stock-adjustment.ts`: loại `REVALUE`, prefix `ĐCG`, nhãn "Điều chỉnh giá", kiểu dòng `VALUE`, câu báo chứng từ gốc ("Nhập mã chứng từ bị sửa"). Kiểm: unit test `formatDocumentCode("REVALUE", 2026, 1)` = `ĐCG-2026-001`, phiếu `REVALUE` có dòng số lượng bị "Dòng không hợp với loại phiếu".

## 3. Sổ kho nhận dòng REVALUE

- [x] 3.1 `src/lib/inventory/post.ts`: `MovementDraft.locationId` cho `null` với `REVALUE`; `lockForPosting` bỏ vị trí `null`; nhánh `REVALUE` dùng `averageAfterRevalue` theo pool đã khóa, không đổi tồn, không kiểm tồn vị trí; `inventory_cost` cập nhật giá BQ. Kiểm: `post.int.test.ts` ghi `REVALUE` +610.000 trên 920 bãi + 300 `CT-0003` → giá 195.500, tồn từng vị trí không đổi; tồn 0 bị từ chối và không dòng nào được ghi.
- [x] 3.2 Đối chiếu: test **`npm run inventory:check` không lệch sau khi ghi** `REVALUE` (`reconcile.int.test.ts` gọi `reconcileInventory` ngay sau dòng `REVALUE` ra mảng rỗng; sửa tay `inventory_cost` sau `REVALUE` thì báo lệch đúng câu). Kiểm: `npm run test:int`.
- [x] 3.3 Truy vấn tồn không bị dòng không vị trí làm sai: integration test D10 (`stock.int.test.ts`: số lượng giữ nguyên, cột Giá trị = tồn × giá mới), tồn theo công trình, `locationStock`/`itemStock` (`totals.ts`), số sổ của kiểm kê. Kiểm: `npm run test:int`.
- [x] 3.4 Ghi đồng thời: `concurrency.int.test.ts` thêm ca duyệt `REVALUE` cùng lúc phiếu nhập cùng (mã + tình trạng): kết quả bằng ghi lần lượt theo thứ tự hoàn tất. Kiểm: `npm run test:int`.

## 4. Service phiếu điều chỉnh giá trị (integration test, mỗi lệnh một transaction)

- [x] 4.1 `src/lib/inventory/adjustments.ts`: tạo/sửa phiếu `REVALUE` nhập tay (chứng từ gốc bắt buộc, có trong sổ và chứa từng mã + tình trạng; tồn 0 chặn lúc lưu; `updatedAt` lệch → 409), `logActivity` Tạo/Sửa. Kiểm: `adjustments.int.test.ts` các scenario "Lý do và chứng từ gốc bắt buộc", "Hết hàng lúc lập".
- [x] 4.2 `src/lib/inventory/revaluations.ts` `buildTripRevaluation`: đọc phiếu nhập (khóa `FOR SHARE`), đơn, chi phí, phiếu sửa chi phí `DONE`, dòng `PURCHASE_IN`; gọi `revaluationFromTrip`; tạo/dựng lại phiếu Nháp có `source_receipt_id`, `recorded_trip_cost`, `corrected_trip_cost`. Kiểm: integration test `PN` mẫu ra đúng 2 dòng; phiếu thứ hai khi phiếu đầu chưa ghi sổ → "PN-2026-094 đã có phiếu điều chỉnh giá ĐCG-… chưa ghi sổ"; đổi trọng lượng chuẩn của mã (chia theo trọng lượng) → buộc lập dòng tay.
- [x] 4.3 Duyệt nhánh `REVALUE` (`approveAdjustment`): khóa phiếu, kiểm lại "đã ghi" với phiếu sửa chi phí, `postMovements`, chuyển `DONE`, `logActivity` Duyệt với tóm tắt "Sửa PN-… · ghi sổ n dòng điều chỉnh giá · ±x ₫". Kiểm: integration test **chưa duyệt chưa ghi sổ** (gửi duyệt: 0 dòng sổ, giá BQ không đổi); **duyệt hai lần chỉ ghi một lần** (hai lần duyệt song song: đúng một bộ dòng `REVALUE`, giá BQ đổi một lần, lần sau "Phiếu đã được ghi sổ"); tồn đổi giữa lập và duyệt → giá theo lúc duyệt (194.229); hết hàng lúc duyệt → từ chối, phiếu vẫn Chờ duyệt; ghi xong `reconcileInventory` rỗng.
- [x] 4.4 Gửi duyệt, trả lại, xóa nháp dùng lại hàm có sẵn cho loại `REVALUE`; nhật ký đủ 6 thao tác. Kiểm: integration test trả lại về Nháp kèm lý do; `src/lib/activity/coverage.test.ts` xanh.

## 5. API

- [x] 5.1 Mở rộng `POST/PUT /api/inventory/adjustments` cho `kind: "REVALUE"`; thêm `POST /api/inventory/adjustments/trip-cost`, `PUT /api/inventory/adjustments/[id]/trip-cost`, `GET /api/inventory/adjustments/revalue-preview`, tất cả bọc `withAuth` theo design D6. Kiểm: `src/app/route-guards.test.ts` xanh; integration test quyền: Kinh doanh tạo → 403, Kế toán duyệt → 403 và giá BQ không đổi, Thủ kho gọi `trip-cost` → 403.
- [x] 5.2 Kiểm đầu vào ở biên bằng zod (như `src/lib/read-json.ts`): chênh lệch số nguyên khác 0, chi phí chuyến số nguyên ≥ 0, lý do ≤ 500 ký tự. Kiểm: integration test câu báo lỗi trả về đúng.

## 6. Giao diện Desktop

- [x] 6.1 `/inventory/adjustments`: menu "Lập phiếu" thêm "Điều chỉnh giá trị", "Sửa chi phí chuyến"; danh sách có loại "Điều chỉnh giá". Kiểm: component test (`src/components/inventory/inventory.test.tsx`) menu đủ 4 mục với `inventory.adjust`, không có với người chỉ xem.
- [x] 6.2 Khung "Điều chỉnh giá trị" (chứng từ gốc, lý do, dòng mã + tình trạng + chênh lệch, ô xem trước gọi `revalue-preview`) và khung "Sửa chi phí chuyến" (chọn phiếu nhập, chi phí đã ghi, chi phí đúng, bảng dòng chỉ đọc); tiền viết `1.250.000 ₫`, chỉ token Bright Blue Base. Kiểm: component test xem trước hiện "Tồn 1.240 cái · Giá BQ 195.282 ₫ · Giá trị 242.149.680 ₫ → Giá BQ mới 194.072 ₫"; `npm run lint` (chặn màu cứng) xanh.
- [x] 6.3 Chi tiết phiếu `ĐCG`: chứng từ gốc (liên kết), chi phí đã ghi → đúng, dòng với giá BQ trước → sau, tổng chênh lệch, dòng sổ đã sinh khi `DONE`; nút duyệt/trả lại chỉ cho Giám đốc. Kiểm: component test theo scenario "Giám đốc mở phiếu chờ duyệt".
- [x] 6.4 Thẻ kho D11 (`src/lib/inventory/card.ts`, `stock-card-table.tsx`): dòng `REVALUE` hiện ở mọi bộ lọc vị trí, nhãn "Điều chỉnh giá", Nhập/Xuất/Đơn giá trống, Tồn không đổi. Kiểm: `card.int.test.ts` lọc Tại bãi và Tại công trình đều có dòng; component test nhãn và ô trống.

## 7. Dữ liệu mẫu, E2E

- [x] 7.1 Seed dev: một phiếu `ĐCG` Chờ duyệt sửa chi phí của một phiếu nhập mẫu (không ghi sổ). Cập nhật bảng lệnh `db:seed:dev` trong `CLAUDE.md`. Kiểm: `npm run db:seed:dev` chạy hai lần không lỗi, `npm run inventory:check` "0 lệch".
- [x] 7.2 E2E (`tests/e2e/stock-value-adjustment.spec.ts`, ghi vào `E2E-KHO-01`, kiểm theo chênh lệch): Kế toán lập phiếu điều chỉnh giá trị nhập tay, gửi duyệt; Giám đốc duyệt; thẻ kho có dòng "Điều chỉnh giá" và giá BQ mới đúng công thức. Thêm một dòng ghi chú E2E vào `CLAUDE.md` mục "Lưu ý" nếu dùng dữ liệu cố định mới. Kiểm: `npm run test:e2e` xanh.

## 8. Kiểm tra cuối

- [x] 8.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` xanh, `npx openspec validate stock-value-adjustment --strict` xanh, coverage `src/domain`, `src/lib` ≥ 80 %.
- [ ] 8.2 Gắn nhãn `update-snapshots` vào PR apply (trang Phiếu điều chỉnh và D11 đổi), chờ CI xanh.
- [ ] 8.3 Kiểm tra tay trên Edge 1366px: lập "Sửa chi phí chuyến" cho phiếu nhập mẫu, so số dòng với tính tay; duyệt; mở D11 và `npm run inventory:check`. Chưa làm kịp thì ghi "làm sau, theo dõi ở #33" khi archive.

## Workflow follow-up

- Review proposal trên PR, comment "Duyệt", rồi `/opsx:apply stock-value-adjustment`.
- Sau khi merge PR apply: `/opsx:archive stock-value-adjustment` → PR `Closes #42`.
