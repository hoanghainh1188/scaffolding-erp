# Tasks: repair-work-orders

## 1. Migration và schema

- [x] 1.1 Thêm `LITER` vào `QUANTITY_UNITS` (`src/domain/quantity.ts`: nhãn "lít", đơn vị đo 3 số lẻ, cần trọng lượng chuẩn, `isRepairableUnit` = false). Migration thay CHECK `item_unit_check`. Unit test: 0,5 lít nhận được, 0,0005 lít bị từ chối, `isRepairableUnit("LITER")` = false. Test chống lệch CHECK ↔ domain xanh.
- [x] 1.2 Migration `item.repair_labor_rate bigint null check >= 0`. Schema Drizzle cập nhật. Integration test: −1 bị DB từ chối.
- [x] 1.3 Migration `repair_order`:
  - Thêm `kind`, các cột người / lúc của từng bước, `return_note`, `cancel_reason`, `receive_posting_id`, `cancel_posting_id`.
  - CHECK `status` mở rộng, và `SIMPLE` chỉ có `DRAFT` / `POSTED`.
  - Integration test (`src/db/schema/repairs.int.test.ts`): phiếu cũ đọc được với `kind = 'SIMPLE'`; `SIMPLE` + `ASSIGNED` bị từ chối.
- [x] 1.4 Migration `repair_order_line` thêm `labor_rate`, `reported_good`, `reported_scrap`, `labor_amount`, `material_amount`; nới CHECK số lượng cho 0 / 0. Tạo bảng `repair_order_material` (UNIQUE `line_id, item_id`, `quantity > 0`). Mở rộng trigger khóa cho lệnh `POSTED` / `CANCELLED` (cả vật tư). Integration test: sửa vật tư của lệnh `POSTED` bị trigger chặn.
- [x] 1.5 Bảng chỉ ghi thêm `repair_order_submission` (`order_id`, `step`, `draft_id` UNIQUE, `created_by`, `created_at`), trigger `*_append_only`, thêm vào `APPEND_ONLY_TABLES` (`src/db/grants.ts`). Test chống lệch `APPEND_ONLY_TABLES` xanh; UPDATE / DELETE bị trigger chặn.
- [x] 1.6 Thêm `repairs.work` (DIRECTOR, WORKSHOP) và `repairs.count` (DIRECTOR, WAREHOUSE) vào `src/domain/permissions.ts`. Test bảng quyền theo spec `auth` xanh.

## 2. Logic thuần và unit test

- [x] 2.1 `src/domain/repair-work-order.ts`: trạng thái, bảng bước, `transition(status, step)` (bước sai ném lỗi kèm trạng thái). Unit test đủ mọi cặp hợp lệ / không hợp lệ: Thu hồi khi Đang sửa → lỗi; Ghi sổ khi Chờ nghiệm thu → lỗi.
- [x] 2.2 `laborAmount(goodMilli, rate)` và `checkReport(lines)` (sửa xong + phế = lấy ra; vật tư > 0, đúng đơn vị, không trùng trên một dòng; dòng sửa xong 0 không có vật tư). Unit test:
  - `GG-K17` 36 × 40.000 = 1.440.000 ₫; phế không tính công.
  - 30 + 4 ≠ 40 bị từ chối.
  - `VT-SON` dùng trên hai dòng được.
- [x] 2.3 `splitMaterialIssue(need, { newMilli, goodMilli })`: lấy Mới trước rồi Tốt, thiếu thì báo số còn. Unit test: `VT-BL12` cần 30, có 20 Mới + 100 Tốt → 20 / 10; cần 6 kg, có 4 kg → lỗi "còn 4 kg".
- [x] 2.4 `workOrderPostingLines(...)`:
  - Dựng dòng sổ của lần ghi sổ lệnh từ `costRepairLine` (dùng lại, `repairCost = công + vật tư`) và các dòng xuất vật tư.
  - `receiveLines` / `cancelLines` (cặp `TRANSFER_*` Chờ sửa).
  - Unit test ví dụ D12: `GG-K17` chi phí 1.980.000 ₫, giá vào Tốt **221.528 ₫/cái** (giá trị 7.975.000 ₫); `CHEO-1,7` 245.000 ₫ → **42.250 ₫/cái**; tổng giá trị các dòng = +1.640.000 ₫ = công; lấy tại chính xưởng → không có dòng nhận.
- [x] 2.5 Sửa `src/domain/gross-profit.ts`:
  - `RepairSum.materialCost`.
  - `ledgerCostCheck` dùng `repairCost − materialCost`; `repairSpent` vẫn là `repairCost`.
  - Unit test: lệnh D12 cho đẳng thức 0 ₫, và công thức cũ lệch 585.000 ₫ (test đỏ nếu quay lại công thức cũ).
  - Unit test: ví dụ `H1,7` có vật tư 200.000 ₫ rồi mất (spec `gross-profit`), tổng ba tháng không trừ vật tư hai lần.
  - Phiếu đơn giản cũ (`materialCost` = 0) cho đúng số cũ.

## 3. Danh mục và phiếu nhập vật tư

- [x] 3.1 `src/lib/catalog/`: đọc và ghi `repair_labor_rate`. Chỉ `repairs.manage` sửa được trường này (Kinh doanh gửi kèm → 403 cho trường đó); mã nhóm Vật tư không nhận trường này. Ghi nhật ký qua `logActivity` (`diffFields`). Integration test theo spec `item-catalog`.
- [x] 3.2 D9: ô "Đơn giá công sửa / cái" trên form (chỉ hiện khi có `repairs.manage`); chi tiết hiện "Công sửa 40.000 ₫ / cái" cho người có `repairs.view`; đơn vị lít trong danh sách chọn ĐVT. Component test.

- [x] 3.3 `src/lib/receiving/post.ts`: nhận vị trí `WORKSHOP` khi mọi dòng của đơn là mã nhóm `MATERIAL`, còn lại chỉ `YARD`; lỗi 422 theo spec `goods-receipts`. Integration test: đơn toàn vật tư nhập `XUONG-01` được (`PURCHASE_IN` tại xưởng); đơn có `GG-K17` gửi `XUONG-01` bị từ chối, không ghi gì.
- [x] 3.4 `src/lib/receiving/queries.ts` và M3: cờ `materialsOnly`, ô vị trí nhập có xưởng chỉ khi cờ bật. Component test hai đơn như spec.

## 4. Service lệnh sửa (`src/lib/repairs/`)

- [x] 4.1 `work-orders.ts`: tạo, sửa nháp (chỉ `DRAFT`, so `updatedAt` → 409), xóa nháp. Kiểm xưởng loại `WORKSHOP`, chỗ lấy là bãi hoặc chính xưởng, mã sửa được. `POST` kiểu phiếu đơn giản bị 422. Mỗi hàm gọi `logActivity`. Integration test.
- [x] 4.2 `assign` (chụp `labor_rate`, thiếu đơn giá thì từ chối) và `recall` (xóa số đã chụp). Integration test: đổi đơn giá ở danh mục sau khi giao không đổi `labor_rate` của lệnh.
- [x] 4.3 `receive(draftId, updatedAt)`: khóa lệnh → `lockForPosting` → `postMovements` `TRANSFER_*` (posting riêng, lưu `receive_posting_id`). Tìm `draftId` trong `repair_order_submission` **trước** khi khóa lệnh; đã dùng thì trả trạng thái hiện tại, không ghi. Integration test:
  - Tồn `BAI-01` 201 → 161 và `XUONG-01` 0 → 40.
  - Giá BQ, tổng giá trị không đổi.
  - Bãi thiếu hàng → từ chối, không ghi.
  - Gửi lại cùng `draftId` → chỉ 4 dòng sổ.
- [x] 4.4 `report` (Xưởng) và `count` (Thủ kho): lưu số và vật tư, `reported_*` chỉ do `report` ghi, so `updatedAt`, ghi `draftId` vào `repair_order_submission` (tìm trước, đã dùng thì không ghi). `returnToWorkshop` (bắt buộc lý do, bỏ số đếm). Integration test:
  - Trả lại khi Thủ kho đang đếm → lệnh đếm 409.
  - Thủ kho đếm khác xưởng thì giữ cả hai số.
  - Báo (`d1`) → trả lại → báo lần hai (`d2`) → gửi lại `d1`: số của lần hai giữ nguyên, không có dòng nhật ký thêm.
- [x] 4.5 `postWorkOrder`:
  - Thứ tự khóa theo design D5.
  - Đọc tồn vật tư ở xưởng dưới khóa.
  - Giá sắt vụn khi có phế.
  - Xác nhận chi phí cao (422 như phiếu đơn giản).
  - Ghi dòng sổ, cập nhật dòng lệnh và vật tư **trước** khi đổi `POSTED`.
  - Integration test:
    - Ví dụ D12 đủ số; Chờ sửa xuất ở `XUONG-01`, Tốt và Phế liệu nhập ở `BAI-01` (tồn `BAI-01` 920 → 956 Tốt, 42 → 46 Phế liệu; `XUONG-01` 40 → 0 Chờ sửa); lệnh lấy tại chính xưởng nhập ở xưởng.
    - Tồn `VT-QH` 18 → 12 kg, `VT-SON` 12 → 8,5 lít; tổng giá trị kho giảm 585.000 ₫ ở hai mã vật tư.
    - Thiếu vật tư → từ chối, không ghi gì.
    - Ghi sổ hai lần → một bộ dòng.
    - `npm run inventory:check` không lệch.
    - Ghi cùng lúc với một phiếu nhập cùng mã cho giá BQ đúng.
- [x] 4.6 `cancel` (bắt buộc lý do; sau nhận thì ghi chuyển ngược, posting riêng; xưởng thiếu hàng thì từ chối). Integration test cả hai trường hợp.
- [x] 4.7 Test tĩnh `src/lib/activity/coverage.test.ts` bắt đủ hàm ghi mới gọi `logActivity`. Tóm tắt nhật ký theo spec `activity-log` (Nhận lệnh, Đếm khác số, Ghi sổ có công / vật tư). Integration test cho từng tóm tắt.

## 5. Báo cáo D15 và hàng cho thuê

- [x] 5.1 `src/lib/reports/costs.ts` `repairSums`: nối sổ theo `repair_order.posting_id`, cộng `material_amount`. Integration test:
  - Lệnh nhận 30/10, ghi sổ 02/11 → chi phí đã chi vào tháng 11.
  - D15 tháng có lệnh D12: khoản Sửa chữa 0 ₫, "Chi phí sửa đã chi 2.225.000 ₫", và `ledgerCostCheck` khớp tổng giá vốn và hao hụt.
- [x] 5.2 `src/lib/reports/fleet.ts`: chỉ mã nhóm `EQUIPMENT`. Integration test: 18 kg `VT-QH` Mới ở `XUONG-01` không vào hàng cho thuê bình quân, hao hụt, khai thác. Chạy `npm run bench:reports` so với số đo trước (ghi kết quả vào PR).

## 6. API

- [x] 6.1 Desktop `/api/repairs/**`:
  - Tạo, sửa, xóa, `assign`, `recall`, `return`, `cancel`, `post` (chọn đường theo `kind`).
  - `withAuth` đúng quyền.
  - Integration test (`repairs-api.int.test.ts`): Xưởng, Thủ kho gọi `/post` → 403; Kinh doanh gọi `assign` → 403; 409 khi `updatedAt` lệch.
  - `src/app/route-guards.test.ts` xanh.
- [x] 6.2 Điện thoại `/api/m/repairs/**`:
  - Danh sách, chi tiết, `receive`, `report`, `count`, `materials`.
  - `repairs.work` / `repairs.count` theo route; Kế toán → 403.
  - Test JSON không có khóa nào khớp `/price|cost|amount|rate|labor|value/i`, kể cả với Giám đốc.

## 7. Giao diện desktop D12 và danh sách

- [x] 7.1 `/repairs`: danh sách gộp hai loại, lọc trạng thái mới trên URL, nút "Lệnh mới", cột chi phí "—" khi lệnh chưa ghi sổ. Component test theo spec `repair-orders`.
- [x] 7.2 D12 lệnh (`/repairs/<mã>` khi `kind = WORK_ORDER`), theo `docs/design/screens/D12-RepairOrder.dc.html` (bản đã sửa trong PR propose: "Nhập 56 Tốt, 4 Phế liệu ở BAI-01", nhãn "Vật tư phụ (giá BQ)"), dùng token, không hex:
  - Tiến trình 6 bước.
  - Bảng hàng / công / vật tư.
  - Khối giá vốn khi vào Tốt.
  - Tổng chi phí, khối "Khi ghi sổ", tồn vật tư ở xưởng.
  - Nút theo trạng thái và quyền.
  - Hộp lý do trả lại / hủy, hỏi lại chi phí cao.
  - Component test với số ví dụ D12 (221.528 ₫, "Công 1.640.000 ₫ · vật tư 585.000 ₫").
- [x] 7.3 D12 lệnh Nháp: chọn xưởng, tổ, chỗ lấy, danh sách "Đang chờ sửa tại …" để thêm mã, nút "Giao xưởng". Phiếu `SIMPLE` vẫn mở D12 đơn giản cũ (test cũ của `simple-repair` xanh).

## 8. Giao diện điện thoại M8 và M1

- [ ] 8.1 `/m/repairs`: thẻ theo quyền (Nhận lệnh, Tiếp tục, Đếm nghiệm thu), không có giá. Component test theo spec `repair-mobile`.
- [ ] 8.2 M8 `/m/repairs/<mã>` theo `docs/design/screens/M8-Repair.dc.html`:
  - Stepper Sửa xong / Hỏng → Phế.
  - Vật tư và "+ Thêm vật tư".
  - Chân màn "56 sửa xong · 4 phế · đủ 60 / 60".
  - Khung "Văn phòng trả lại".
  - Nháp trên máy qua `src/lib/drafts/` (loại nháp mới, gửi lại khi có mạng, "Bị từ chối" khi lệnh đã hủy).
  - Hộp hỏi lại khi nhận lệnh.
  - Component test.
- [ ] 8.3 M1: khối "Sửa chữa" cho `repairs.work` / `repairs.count`, tính vào N, nhãn "Văn phòng trả lại"; nháp M8 hiện ở thanh "N phiếu chưa gửi" và M7. Component test theo spec `mobile-home`.

## 9. Seed, E2E, ảnh mốc

- [ ] 9.1 `db:seed:dev` và `db:seed:demo`:
  - Nhóm "Vật tư phụ" và `VT-QH`, `VT-SON`, `VT-BL12` có tồn ở `XUONG-01`.
  - Đơn giá công `GG-K17` 40.000 ₫, `GG-CH` 10.000 ₫.
  - Một lệnh mẫu Đã đếm như D12.
  - Mã yêu cầu cố định, chạy lại không thêm.
  - Cập nhật mô tả `db:seed:dev` trong `CLAUDE.md`.
  - Integration test `sample.int.test.ts`: chạy hai lần vẫn một lệnh mẫu.
- [ ] 9.2 Global setup E2E:
  - `E2E-VT-01` (nhóm Vật tư) giữ ≥ 10 kg ở `XUONG-01`.
  - Đơn giá công `E2E-KHO-01`.
  - ≥ 5 `E2E-KHO-01` Chờ sửa ở `BAI-01`.
  - Hủy lệnh chưa ghi sổ do `e2e.*` lập.
  - Ghi quy ước vào `CLAUDE.md` (mục lưu ý E2E).
- [ ] 9.3 `tests/e2e/repairs.spec.ts` (nhóm nối tiếp):
  - Luồng đủ 6 bước: Kế toán → Xưởng (`statePath("WORKSHOP")`) → Thủ kho (`statePath("WAREHOUSE")`) → Kế toán.
  - Kiểm theo chênh lệch tồn `BAI-01` / `XUONG-01` và tồn vật tư: sau ghi sổ, Tốt `E2E-KHO-01` tăng ở `BAI-01` (0.2 #130), Chờ sửa ở `XUONG-01` về như trước khi nhận.
  - Thêm một test trả lại xưởng, một test 403.
  - `npm run test:e2e` xanh.
- [ ] 9.4 Ảnh mốc `@visual`: D12 lệnh mẫu (ô tiền `data-mask`), M8 Đang sửa, D9 / D10 sau khi thêm mã vật tư. Gắn nhãn `update-snapshots` vào PR, CI xanh.

## 10. Kiểm tra cuối

- [ ] 10.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate repair-work-orders --strict` đều xanh; `npm run inventory:check` không lệch trên DB dev sau E2E.
- [ ] 10.2 Kiểm tra tay trên Edge 1366px (D12 lệnh, `/repairs`, D9) và điện thoại 390px (M1, M8) so với file thiết kế; nếu chưa làm được thì ghi "làm sau, theo dõi ở #33" và thêm mục vào #33.

## Workflow follow-up

- Apply mở **PR code riêng** (nhánh `repair-work-orders`, PR mới sau khi PR propose merge) để review code trước khi merge.

- Sau khi merge PR apply: `/opsx:archive repair-work-orders` → PR "docs: archive repair-work-orders" (`Closes #16`).
