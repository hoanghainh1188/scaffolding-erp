## 1. Migration và schema

- [ ] 1.1 Schema Drizzle `src/db/schema/production.ts` cho 7 bảng (design D9). Migration SQL tạo bảng, CHECK (gồm `quantity_planned` nguyên > 0), khóa ngoại `RESTRICT` / `CASCADE`, index (`status, created_at`).
- [ ] 1.2 Migration thay `inventory_ledger_movement_check` (thêm `PRODUCTION_OUT`, `PRODUCTION_IN`).
  - Thêm vào `MOVEMENTS_IN` / `MOVEMENTS_OUT` (`src/db/schema/inventory.ts`) và `MOVEMENTS` (`src/domain/movement.ts`).
  - Thêm `PRODUCTION_IN` vào `changesAverage` và câu báo `amountNotAllowed`.
  - Test chống lệch CHECK ↔ TS xanh. Unit test: `PRODUCTION_IN` thiếu `amount` bị từ chối, `PRODUCTION_OUT` có `amount` bị từ chối.
- [ ] 1.3 Trigger `production_order_frozen` (lệnh, dòng, nguyên liệu khi `POSTED` / `CANCELLED`) và `production_order_submission_append_only`. Thêm `production_order_submission` vào `APPEND_ONLY_TABLES`. Integration test bằng owner:
  - sửa lệnh đã ghi sổ bị chặn;
  - UPDATE / DELETE submission bị chặn;
  - `erp_app` không có UPDATE trên bảng submission.
- [ ] 1.4 Nhật ký:
  - thêm loại chứng từ `PRODUCTION_ORDER`, `PRODUCTION_BOM` vào `DOCUMENT_TYPES` và CHECK `activity_log_document_type_check` (không đổi CHECK thao tác: mọi thao tác đã có);
  - nhãn loại trên D18;
  - `actionLabel` thêm nhánh `PRODUCTION_ORDER`: `REPORT` "Báo làm xong", `RETURN` "Trả lại xưởng", `APPROVE` "Duyệt vượt định mức".

  Unit test `actionLabel`.
- [ ] 1.5 Quyền `production.view`, `.manage`, `.approve`, `.work`, `.count` trong `src/domain/permissions.ts` theo design D6. Unit test bảng quyền.

## 2. Logic nghiệp vụ (hàm thuần + unit test)

- [ ] 2.1 Chuyển `laborAmount`, `splitMaterialIssue`, `issueAmount` sang `src/domain/work-order-common.ts`; `splitMaterialIssue` nhận câu báo làm tham số. `repair-work-order.ts` import lại. Test cũ của lệnh sửa xanh, câu báo của lệnh sửa không đổi.
- [ ] 2.2 `src/domain/production-bom.ts`: kiểm định mức (thành phẩm nhóm Thiết bị đơn vị đếm, nguyên liệu nhóm Vật tư, số > 0, không trùng, ≥ 1 nguyên liệu, công ≥ 0). `bomEstimate`, có test:
  - ví dụ D19 ra 282.100 + 35.000 = 317.100 ₫;
  - nguyên liệu chưa có giá ra "chưa đủ giá";
  - lấy giá Tốt khi Mới chưa có giá.
- [ ] 2.3 `src/domain/production-order.ts`:
  - `PRODUCTION_PREFIX = "LSX"`, `PRODUCTION_DOCUMENT_TYPE = "PRODUCTION"`;
  - trạng thái, nhãn, bảng bước `transition()` (bước lệch trạng thái trả lỗi 409);
  - kiểm số kế hoạch nguyên > 0.
- [ ] 2.4 Định mức và vượt: `OVERUSE_LIMIT_PERCENT = 5`, `normMilli` (đơn vị đếm làm tròn lên), `overuse`, `overuseValue`. Test:
  - 391 / 360 = + 8,6 % vượt;
  - 609 / 580 = + 5,0 % không vượt;
  - định mức 0 với 0,5 kg là vượt;
  - 7,5 / 8 = − 6,3 %;
  - 0,5 cây × 3 = 2 cây, dùng 2 không vượt;
  - giá trị vượt D20 = 1.349.500 ₫.
- [ ] 2.5 `productionPostingLines`: dòng sổ, giá trị và `description` từng dòng. Test:
  - ví dụ D20: `GG-K17` 32.660.500 ₫ (326.605 ₫ / cái), `GG-CH` 13.206.500 ₫ (66.033 ₫ / cái), tổng 45.867.000 ₫, đầu thừa 352.500 ₫;
  - tổng mọi dòng sổ = +5.100.000 ₫ = công;
  - chia Mới trước rồi Tốt (300 Mới + 91 Tốt = 7.156.000 ₫);
  - hai dòng cùng dùng `VT-ONG27`;
  - không có đầu thừa thì không có dòng Phế liệu;
  - mô tả "LSX-2026-004: nhập sản xuất GG-K17", "… nguyên liệu làm …", "… đầu thừa làm …".
- [ ] 2.6 Kiểm ghi sổ (hàm thuần). Mỗi điều kiện một test, đúng câu báo:
  - thiếu nguyên liệu (977 / 900 kg), câu riêng của sản xuất;
  - dòng làm xong 0;
  - đầu thừa nặng hơn nguyên liệu (600 / 593,8 kg);
  - giá trị ≤ 0;
  - có đầu thừa mà chưa có giá sắt vụn hoặc chưa chọn Mã sắt vụn;
  - có vượt mà chưa duyệt.
- [ ] 2.7 `checkFloorReport` cho báo / đếm:
  - mỗi dòng có đúng một mục;
  - số làm xong nguyên ≥ 0;
  - nguyên liệu: đơn vị đếm là số nguyên, đơn vị đo tối đa 3 số lẻ (`VT-CHOT` 400,5 cái bị từ chối);
  - nguyên liệu là mã nhóm Vật tư.
- [ ] 2.8 D15 (`src/domain/gross-profit.ts`): `ProductionSum`, `ledgerCostCheck` cộng công sản xuất, `productionSpent`. Test:
  - tháng chỉ có `LSX-2026-004`: đẳng thức = 0;
  - cộng nhầm nguyên liệu: lệch 41.119.500;
  - `classifyLedger("PRODUCTION", "PRODUCTION_IN" | "PRODUCTION_OUT")` = `null`.

## 3. Server và API

- [ ] 3.1 `src/lib/production/boms.ts`:
  - hàm `createBom`, `updateBom`, `deleteBom`;
  - khóa `FOR UPDATE` định mức, `FOR SHARE` vật tư;
  - `updatedAt` lệch thì 409;
  - `logActivity` chỉ khi có trường đổi.

  Route `/api/production/boms/**` bọc `withAuth`. Integration test:
  - quyền: Kinh doanh 403 khi lưu, Xưởng 403 khi đọc;
  - lưu không đổi gì thì không ghi nhật ký.
- [ ] 3.2 Mã sắt vụn: `src/lib/production/settings.ts` (`setScrapItem`), route `/api/production/settings` (`scrap-price.manage`). Kiểm mã kg nhóm Vật tư. Test 403 cho Kế toán.
- [ ] 3.3 `src/lib/production/orders.ts`: tạo (`nextDocumentCode` `LSX`), sửa, xóa nháp, `lockProductionOrder`, `assertFresh`. Route `/api/production/orders`, `/[code]`. Integration test:
  - đọc lệnh Nháp `GG-K17` 100 cái trả nguyên liệu dự kiến 980 / 360 / 12 / 8 / 400;
  - 409 với `updatedAt` cũ.
- [ ] 3.4 Giao xưởng (chụp định mức, công) và thu hồi (bỏ phần chụp). Integration test:
  - giao từ chối khi mã chưa có định mức;
  - thu hồi rồi giao lại chụp giá mới;
  - sửa định mức sau khi giao không đổi lệnh.
- [ ] 3.5 Trả lại (bỏ số đếm và lần duyệt, giữ số báo) và hủy (không ghi sổ). Integration test cả hai, kèm ghi chú / lý do bắt buộc.
- [ ] 3.6 Bước điện thoại `src/lib/production/floor.ts`: nhận, báo, đếm. `draftId` tìm trước khi khóa, lưu `production_order_submission`. Đếm sang `AWAITING_APPROVAL` khi có vượt. Integration test:
  - gửi lại `d1` muộn sau `d2` không đè số;
  - gửi lại không ghi thêm nhật ký.
- [ ] 3.7 Duyệt vượt định mức (`production.approve`, ghi chú bắt buộc). Test:
  - Kế toán 403;
  - ghi sổ khi Chờ Giám đốc duyệt trả 409.
- [ ] 3.8 Ghi sổ `src/lib/production/post.ts` theo design D10 (đọc Mã sắt vụn và giá trước `lockForPosting`; ghi số cuối trước khi đổi `POSTED`). Route `/post`.
- [ ] 3.9 Integration test ghi sổ:
  - ví dụ D20 đủ số trên sổ (vị trí, tình trạng, giá trị, mô tả) và giá BQ `GG-K17` Mới sau ghi sổ;
  - thiếu nguyên liệu thì không ghi dòng nào;
  - `reconcileInventory` không lệch;
  - Xưởng và Thủ kho gọi ghi sổ bị 403.
- [ ] 3.10 `src/lib/reports/costs.ts`: `productionSums()` (lọc `PRODUCTION`, nối theo `posting_id`). Integration test: D15 tháng có lệnh ghi sổ cho đẳng thức 0 và "Công sản xuất đã chi" đúng.
- [ ] 3.11 API điện thoại `/api/m/production/**` và `phone-queries.ts` chọn cột tường minh. Test:
  - JSON không có khóa khớp `/price|cost|amount|rate|labor|value/i`;
  - Kế toán 403;
  - Thủ kho gọi `report` 403.
- [ ] 3.12 `coverage.test.ts`: `WRITE_NAME` phủ hàm ghi mới. Mọi hàm ghi gọi `logActivity`. Test tóm tắt nhật ký theo các scenario spec `activity-log`.

## 4. Giao diện

- [ ] 4.1 Menu: mục "Sản xuất" sau "Sửa chữa" (`src/lib/navigation.ts`, nhãn tiếng Việt). `/production/**` làm nổi mục này. Cập nhật test sidebar (10 mục, Kinh doanh 7 mục).
- [ ] 4.2 D19 `/production/boms` theo `D19-ProductionBom.dc.html`:
  - danh sách mã đã có định mức, "+ Thêm định mức";
  - bảng nguyên liệu, công, giá thành dự tính;
  - chỉ `production.manage` thấy nút sửa.

  Component test.
- [ ] 4.3 Trang Giá sắt vụn thêm ô Mã sắt vụn (chọn mã kg nhóm Vật tư). Component test.
- [ ] 4.4 `/production`: danh sách và lọc trạng thái. `/production/new` và form sửa nháp (nguyên liệu dự kiến theo định mức). Component test.
- [ ] 4.5 D20 phần đầu: tiến trình 7 bước, khối cảnh báo vượt, nút theo quyền và trạng thái (giao, thu hồi, trả lại, duyệt có ghi chú, hủy có lý do, ghi sổ). Component test nút theo vai trò.
- [ ] 4.6 D20 phần số liệu:
  - từng dòng: định mức, thực dùng, chênh, giá trị, công, đầu thừa, giá vốn / cái;
  - số đếm cạnh số báo; tổng lệnh;
  - "tạm tính" trước ghi sổ.

  Component test với ví dụ D20.
- [ ] 4.7 M10 `/m/production` (danh sách) và khung `/m/production/[code]`: stepper làm xong, ô đầu thừa kg, nút Báo làm xong / Đếm xong, nháp loại `PRODUCTION`, `productionSender`.
- [ ] 4.8 M10 phần nguyên liệu:
  - điền sẵn định mức × số làm xong (đơn vị đếm làm tròn lên), giữ số đã sửa tay;
  - thêm, bỏ nguyên liệu;
  - nhắc vượt định mức.

  Component test: 980 → 882 kg khi đổi 100 → 90; 0,5 cây × 3 → 2.
- [ ] 4.9 M1: khối "Sản xuất" theo spec `mobile-home`, đếm vào N, nhãn "Văn phòng trả lại". Component test.
- [ ] 4.10 D15: dòng "Công sản xuất đã chi trong kỳ" dưới bảng, cho từng cột. Component test.

## 5. Seed, E2E, ảnh mốc

- [ ] 5.1 `src/lib/production/sample.ts` (`seedProduction`):
  - nguyên liệu;
  - thêm tồn `VT-QH` 20 kg × 45.000 ₫ và `VT-SON` 20 lít × 90.000 ₫ ở `XUONG-01` (design D8);
  - `PL-SATVUN`, Mã sắt vụn;
  - định mức `GG-K17`, `GG-CH`;
  - lệnh mẫu Chờ Giám đốc duyệt như D20.

  Gọi từ `seed-dev.mts` và `seed-demo.mts`; chạy lại không thêm. Cập nhật dòng `db:seed:dev` trong `CLAUDE.md`.
- [ ] 5.2 Global setup E2E theo design D8: `E2E-SX-01`, `E2E-VT-02`, định mức, Mã sắt vụn, hủy lệnh `e2e.*` còn mở. Kiểm mã mới không làm đổi ảnh mốc D1, D9, D10. Ghi lưu ý E2E vào `CLAUDE.md`.
- [ ] 5.3 `tests/e2e/production.spec.ts`:
  - luồng đủ: lập → giao → nhận → báo → đếm → ghi sổ, kiểm theo chênh lệch;
  - luồng vượt định mức có Giám đốc duyệt;
  - trả lại xưởng;
  - 403;
  - M10 không có tiền.
- [ ] 5.4 Ảnh mốc `@visual`: `d19-bom`, `d20-production`, `m10-production`, ô tiền gắn `data-mask`. Gắn nhãn `update-snapshots` vào PR (sidebar đổi mọi ảnh desktop).
- [ ] 5.5 `CLAUDE.md`:
  - mục "Sản xuất" ở phần Quy ước code: bảng, loại dòng sổ, đẳng thức D15, thứ tự khóa, làm tròn đơn vị đếm;
  - từ điển: Định mức, Lệnh sản xuất, Đầu thừa, Mã sắt vụn.

## 6. Kiểm tra

- [ ] 6.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate production-orders --strict` xanh.
- [ ] 6.2 `npm run inventory:check` trên DB dev sau khi seed và chạy E2E: không lệch.
- [ ] 6.3 Kiểm tra tay trên Edge 1366px:
  - D19, D20, M10 so với file thiết kế;
  - Giám đốc duyệt lệnh mẫu, Kế toán ghi sổ, đối chiếu số với D20 (45.867.000 ₫);
  - thẻ kho `GG-K17` hiện dòng "LSX-…: nhập sản xuất GG-K17";
  - D15 tháng ghi sổ có "Công sản xuất đã chi".
